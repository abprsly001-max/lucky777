"""Taking the bet.

The hard part is never accepting the wager -- it is what happens when the price
moves between the punter opening their slip and hitting submit. Every leg is
re-read inside the transaction, and the price the bet is struck at is copied
onto the bet row, because `selections.odds_decimal` will have moved by the time
anyone settles it.
"""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import ledger
from ..core.money import from_micros, payout_micros
from ..models import BookLimits, User
from . import exotics
from .models import Bet, BetSelection, Competition, Event, Market, Selection, Sport
from .odds import parlay_odds


class BetRejected(Exception):
    def __init__(self, reason: str, detail: dict | None = None):
        super().__init__(reason)
        self.reason = reason
        self.detail = detail or {}


async def get_book_limits(session: AsyncSession) -> BookLimits:
    """The single book-wide limits row, created with defaults on first touch."""
    row = await session.get(BookLimits, 1)
    if row is None:
        row = BookLimits(id=1)
        session.add(row)
        await session.flush()
    return row


def _american(decimal_odds: Decimal) -> int:
    """Decimal price to the American line it would print as."""
    if decimal_odds >= 2:
        return round((decimal_odds - 1) * 100)
    return round(Decimal(-100) / (decimal_odds - 1))


async def _staked_against(session: AsyncSession, user_id: int, *, selection_id: int | None,
                          event_id: int | None, include_graded: bool, use_risk: bool) -> int:
    """How much this customer already has against one offering or one event."""
    q = (select(Bet)
         .join(BetSelection, BetSelection.bet_id == Bet.id)
         .join(Selection, Selection.id == BetSelection.selection_id)
         .join(Market, Market.id == Selection.market_id)
         .where(Bet.user_id == user_id))
    if selection_id is not None:
        q = q.where(BetSelection.selection_id == selection_id)
    if event_id is not None:
        q = q.where(Market.event_id == event_id)
    if not include_graded:
        q = q.where(Bet.status == "open")
    bets = (await session.execute(q.distinct())).scalars().all()
    return sum(b.stake_micros if use_risk else b.potential_micros for b in bets)


async def _load_leg(session: AsyncSession, selection_id: int):
    row = (await session.execute(
        select(Selection, Market, Event)
        .join(Market, Market.id == Selection.market_id)
        .join(Event, Event.id == Market.event_id)
        .where(Selection.id == selection_id)
    )).first()
    if not row:
        raise BetRejected("no_such_selection", {"selection_id": selection_id})
    return row


EXOTIC_TYPES = ("teaser", "if_win", "if_action", "reverse")


async def _sport_key_for(session: AsyncSession, event: Event) -> str:
    return (await session.execute(
        select(Sport.key).join(Competition, Competition.sport_id == Sport.id)
        .where(Competition.id == event.competition_id))).scalar() or ""


async def place_bet(
    session: AsyncSession,
    *,
    user_id: int,
    legs: list[dict],          # [{selection_id, odds}] -- odds as the client saw them
    stake_micros: int,
    accept_changes: bool,
    idempotency_key: str,
    max_legs: int = 8,
    bet_type: str = "auto",    # auto | teaser | if_win | if_action | reverse
    teaser_tier: int | None = None,
    free_play: bool = False,
) -> Bet:
    if not legs:
        raise BetRejected("empty_betslip")
    if len(legs) > max_legs:
        raise BetRejected("too_many_legs", {"max": max_legs})
    if bet_type not in ("auto",) + EXOTIC_TYPES:
        raise BetRejected("unknown_bet_type", {"type": bet_type})
    if bet_type in EXOTIC_TYPES and len(legs) < 2:
        raise BetRejected("needs_two_legs", {"type": bet_type})
    if bet_type == "teaser":
        if teaser_tier not in exotics.TEASER_POINTS:
            raise BetRejected("bad_teaser_tier")
        if len(legs) > 6:
            raise BetRejected("too_many_legs", {"max": 6})
    if bet_type == "reverse" and len(legs) > 4:
        raise BetRejected("too_many_legs", {"max": 4, "note": "reverse"})
    if free_play and bet_type in EXOTIC_TYPES:
        raise BetRejected("free_play_straights_only",
                          {"note": "free play covers straights and parlays"})

    ids = [l["selection_id"] for l in legs]
    if len(set(ids)) != len(ids):
        raise BetRejected("duplicate_selection")

    lim = await get_book_limits(session)
    is_parlay = len(legs) > 1   # every multi-leg ticket type, for limit purposes

    lo = lim.min_parlay_micros if is_parlay else lim.min_straight_micros
    hi = lim.max_parlay_micros if is_parlay else lim.max_straight_micros
    if stake_micros < lo:
        raise BetRejected("stake_below_min", {"min": str(from_micros(lo))})
    if stake_micros > hi:
        raise BetRejected("stake_over_max", {"max": str(from_micros(hi))})

    now = datetime.now(timezone.utc)

    if lim.cooloff_sec > 0:
        last = (await session.execute(
            select(Bet.placed_at).where(Bet.user_id == user_id)
            .order_by(Bet.id.desc()).limit(1))).scalar()
        if last is not None:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            gap = (now - last).total_seconds()
            if gap < lim.cooloff_sec:
                raise BetRejected("cooloff", {"wait_sec": int(lim.cooloff_sec - gap)})
    struck: list[tuple[Selection, Decimal, str | None]] = []
    teased: list[Decimal | None] = []
    seen_events: set[int] = set()

    for leg in legs:
        sel, market, event = await _load_leg(session, leg["selection_id"])

        if bet_type == "teaser":
            if market.type not in exotics.TEASEABLE_MARKETS:
                raise BetRejected("not_teaseable", {
                    "selection_id": sel.id, "market": market.type,
                    "note": "teasers take spreads and totals only"})
            sport_key = await _sport_key_for(session, event)
            pts = exotics.TEASER_POINTS[teaser_tier].get(sport_key)
            if pts is None:
                raise BetRejected("not_teaseable", {
                    "selection_id": sel.id, "sport": sport_key,
                    "note": "teasers cover football and basketball"})
            if market.line is None:
                raise BetRejected("not_teaseable", {"selection_id": sel.id})
            teased.append(exotics.tease_line(market.type, sel.key,
                                             Decimal(market.line), pts))
        else:
            teased.append(None)

        if event.status not in ("scheduled", "live"):
            raise BetRejected("event_not_open", {"selection_id": sel.id, "status": event.status})
        if event.status == "scheduled":
            if lim.block_prior_start:
                raise BetRejected("pregame_blocked", {"selection_id": sel.id})
            starts = event.starts_at
            if starts.tzinfo is None:
                starts = starts.replace(tzinfo=timezone.utc)
            if starts <= now:
                raise BetRejected("event_started", {"selection_id": sel.id})
        else:  # in-play
            bettor_row = await session.get(User, user_id)
            if bettor_row is not None and not bettor_row.allow_live and not bettor_row.is_admin:
                raise BetRejected("live_blocked_for_account", {"selection_id": sel.id})
            if lim.block_halftime and event.period == "HT":
                raise BetRejected("halftime_blocked", {"selection_id": sel.id})
            if is_parlay and not lim.live_parlays:
                raise BetRejected("live_parlays_off", {"selection_id": sel.id})
        if market.status != "open" or sel.status != "open":
            raise BetRejected("market_suspended", {"selection_id": sel.id})
        if event.circled:
            from ..config import settings as _settings
            from ..core.money import to_micros as _to_micros
            cap = _to_micros(_settings.circled_max_credits)
            if stake_micros > cap:
                raise BetRejected("circled_limit", {
                    "event_id": event.id, "max": _settings.circled_max_credits})

        # No two legs from the same event unless correlation is actually priced.
        # "Team wins" + "over 2.5 goals" are correlated; multiplying their odds
        # underprices the combination and is how books get arbitraged.
        if len(legs) > 1:
            if event.id in seen_events:
                raise BetRejected("correlated_legs", {"event_id": event.id})
            seen_events.add(event.id)

        current = Decimal(sel.odds_decimal)
        # `.get(k, default)` is wrong here: the key exists but is None when the
        # client omitted a price, and Decimal("None") explodes.
        seen = Decimal(str(leg.get("odds") or sel.odds_decimal))
        if current != seen:
            # drifting in the punter's favour is always accepted
            if current < seen and not accept_changes:
                raise BetRejected("odds_changed", {
                    "selection_id": sel.id, "was": str(seen), "now": str(current)})

        # line caps: no favorites steeper than the max favorite line, no dogs
        # longer than the max dog line (parlays get their own dog cap)
        line = _american(current)
        if line < 0 and line < lim.max_fav_line:
            raise BetRejected("line_too_steep", {
                "selection_id": sel.id, "line": line, "max_favorite": lim.max_fav_line})
        dog_cap = lim.max_dog_line_parlay if is_parlay else lim.max_dog_line
        if line > 0 and line > dog_cap:
            raise BetRejected("line_too_long", {
                "selection_id": sel.id, "line": line, "max_dog": dog_cap})

        # per-offering / per-event position caps for this customer
        risk = bool(lim.use_risk)
        inc = bool(lim.include_graded)
        on_offering = await _staked_against(session, user_id, selection_id=sel.id,
                                            event_id=None, include_graded=inc, use_risk=risk)
        if on_offering + stake_micros > lim.max_per_offering_micros:
            raise BetRejected("over_offering_limit", {
                "selection_id": sel.id,
                "max": str(from_micros(lim.max_per_offering_micros)),
                "already": str(from_micros(on_offering))})
        on_event = await _staked_against(session, user_id, selection_id=None,
                                         event_id=event.id, include_graded=inc, use_risk=risk)
        if on_event + stake_micros > lim.max_per_event_micros:
            raise BetRejected("over_event_limit", {
                "event_id": event.id,
                "max": str(from_micros(lim.max_per_event_micros)),
                "already": str(from_micros(on_event))})

        struck.append((sel, current, market.line))

    n = len(struck)
    leg_odds = [o for _, o, _ in struck]
    charge = stake_micros                # what actually leaves the wallet

    if bet_type == "teaser":
        price = exotics.teaser_price(teaser_tier, n)
        if price is None:
            raise BetRejected("bad_teaser_size", {"legs": n})
        total = price
        potential = payout_micros(stake_micros, price)
        btype, tier = "teaser", teaser_tier
    elif bet_type in ("if_win", "if_action"):
        potential = exotics.if_chain_potential(leg_odds, stake_micros)
        total = (Decimal(potential) / Decimal(stake_micros)).quantize(Decimal("0.0001"))
        btype, tier = bet_type, None
    elif bet_type == "reverse":
        charge = exotics.reverse_cost(n, stake_micros)
        potential = exotics.reverse_potential(leg_odds, stake_micros)
        total = (Decimal(potential) / Decimal(charge)).quantize(Decimal("0.0001"))
        btype, tier = "reverse", None
    else:
        total = parlay_odds(leg_odds)
        potential = payout_micros(stake_micros, total)
        btype, tier = ("single" if n == 1 else "parlay"), None

    win_cap = lim.max_win_parlay_micros if is_parlay else lim.max_win_single_micros
    if potential - charge > win_cap:
        raise BetRejected("over_max_win", {"max_win": str(from_micros(win_cap))})

    if free_play:
        # a free-play ticket only ever pays the WINNINGS
        potential = max(0, potential - charge)

    bet = Bet(
        user_id=user_id, type=btype, teaser_tier=tier,
        stake_micros=charge, total_odds=str(total),
        potential_micros=potential, status="open",
        is_free_play=1 if free_play else 0,
    )
    session.add(bet)
    await session.flush()

    for (sel, odds, line), tl in zip(struck, teased):
        session.add(BetSelection(bet_id=bet.id, selection_id=sel.id,
                                 odds_at_placement=str(odds),
                                 line_at_placement=line,
                                 teased_line=str(tl) if tl is not None else None))

    if free_play:
        # the stake comes out of the FP balance -- no credit on free play
        fp_wallet = await ledger.fp_wallet_for(session, user_id)
        fp_house = await ledger.fp_house_account(session)
        try:
            await ledger.transfer(
                session, idempotency_key=f"sb:{bet.id}:place:{idempotency_key}",
                kind="freeplay_stake", src=fp_wallet.id, dst=fp_house.id,
                amount_micros=charge, ref_type="sports_bet", ref_id=bet.id,
            )
        except ledger.InsufficientFunds:
            raise BetRejected("insufficient_free_play")
    else:
        wallet = await ledger.wallet_for(session, user_id)
        house = await ledger.house_account(session)
        bettor = await session.get(User, user_id)
        floor = -(bettor.credit_limit_micros or 0)   # credit play runs to the limit
        try:
            await ledger.transfer(
                session, idempotency_key=f"sb:{bet.id}:place:{idempotency_key}",
                kind="bet_place", src=wallet.id, dst=house.id, amount_micros=charge,
                ref_type="sports_bet", ref_id=bet.id, src_floor_micros=floor,
            )
        except ledger.InsufficientFunds:
            raise BetRejected("insufficient_balance")

    await session.flush()
    return bet
