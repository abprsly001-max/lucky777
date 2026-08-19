"""Grading and settlement.

Two passes, deliberately separated:

  1. grade_event()  -- write a result onto every selection of an event
  2. settle_bets()  -- pay out bets whose legs are all graded

The split matters because scores get corrected. A re-grade only requires
re-running pass two, and pass two is idempotent, so re-running it is free.
"""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import ledger
from ..core.money import payout_micros
from . import exotics
from .models import Bet, BetSelection, Event, Market, Selection
from .odds import result_factor


# ---------------------------------------------------------- period scopes ----
# scope id -> (labels inside the scope, labels that prove the scope is over)
PERIOD_SCOPE_LABELS: dict[str, tuple[set[str], set[str]]] = {
    "f5": ({f"Inn {i}" for i in range(1, 6)},
           {f"Inn {i}" for i in range(6, 10)}),
    "h1q": ({"Q1", "Q2", "HT"}, {"Q3", "Q4"}),
    "h1s": ({"1H", "HT"}, {"2H"}),
    "p1": ({"P1"}, {"P2", "P3"}),
}


def period_score(event: Event, scope: str) -> tuple[int, int, bool]:
    """(home, away, complete) for a period scope, off the line score."""
    import json as _json
    inside, after = PERIOD_SCOPE_LABELS.get(scope, (set(), set()))
    try:
        rows = _json.loads(event.period_scores or "[]")
    except ValueError:
        rows = []
    h = sum(r["h"] for r in rows if r["p"] in inside)
    a = sum(r["a"] for r in rows if r["p"] in inside)
    complete = (event.status == "ended"
                or any(r["p"] in after for r in rows))
    return h, a, complete


def grade_period_selection(market: Market, sel: Selection,
                           h: int, a: int) -> str:
    """Grade one period-market selection off the scope score."""
    kind = market.type.split(":")[2] if market.type.count(":") >= 2 else ""
    if kind == "h2h":
        if h == a:
            return "void"                    # two-way, no draw offered
        return "won" if (sel.key == "home") == (h > a) else "lost"
    if kind == "total":
        line = Decimal(market.line or "0")
        total = Decimal(h + a)
        if total == line:
            return "push"
        return "won" if (sel.key == "over") == (total > line) else "lost"
    return "void"


def grade_selection(market: Market, sel: Selection, home: int, away: int) -> str:
    """Map a final score to one of: won | lost | push | void."""
    t = market.type
    if t == "alt_spreads":
        t = "spreads"                       # alternate lines grade identically
    elif t == "alt_totals":
        t = "totals"

    if t == "h2h":
        winner = "home" if home > away else "away" if away > home else "draw"
        # a two-way market with no draw selection voids on a tie
        return "won" if sel.key == winner else "lost"

    if t == "double_chance":
        winner = "home" if home > away else "away" if away > home else "draw"
        covers = {"home": {"home", "draw"},     # home or draw
                  "draw": {"home", "away"},     # either team, no draw
                  "away": {"away", "draw"}}     # away or draw
        return "won" if winner in covers[sel.key] else "lost"

    if t == "btts":
        both = home > 0 and away > 0
        return "won" if (sel.key == "yes") == both else "lost"

    if t == "totals":
        line = Decimal(market.line or "0")
        total = Decimal(home + away)
        if total == line:
            return "push"                       # exact landing returns the stake
        over = total > line
        return "won" if (sel.key == "over") == over else "lost"

    if t == "spreads":
        line = Decimal(market.line or "0")       # applied to the home side
        margin = Decimal(home - away) + line
        if margin == 0:
            return "push"
        return "won" if (sel.key == "home") == (margin > 0) else "lost"

    return "void"


async def grade_event(session: AsyncSession, event: Event,
                      home: int, away: int) -> int:
    """Write results onto every selection of the event. Returns how many."""
    event.home_score, event.away_score = home, away
    event.status = "ended"

    rows = (await session.execute(
        select(Selection, Market)
        .join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == event.id)
    )).all()

    two_way_h2h = {}
    for sel, market in rows:
        if market.type == "h2h":
            two_way_h2h.setdefault(market.id, set()).add(sel.key)

    n = 0
    for sel, market in rows:
        if market.type.startswith("prop:"):
            continue                 # player stats aren't in the score; the desk grades these
        if market.status == "settled" and sel.result is not None:
            continue                 # a period market that already paid mid-game
        if market.type.startswith("period:"):
            scope = market.type.split(":")[1]
            ph, pa, _ = period_score(event, scope)
            sel.result = grade_period_selection(market, sel, ph, pa)
        elif market.type == "h2h" and home == away and "draw" not in two_way_h2h[market.id]:
            sel.result = "void"      # tie on a market that never offered the draw
        else:
            sel.result = grade_selection(market, sel, home, away)
        sel.status = "settled"
        market.status = "settled"
        n += 1

    await session.flush()
    return n


async def void_event(session: AsyncSession, event: Event, reason: str = "abandoned") -> int:
    event.status = reason
    rows = (await session.execute(
        select(Selection).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == event.id))).scalars().all()
    for sel in rows:
        sel.result, sel.status = "void", "settled"
    await session.flush()
    return len(rows)


async def settle_bets(session: AsyncSession) -> dict:
    """Pay out every open bet whose legs are all graded.

    Idempotent by construction: the ledger key is derived from the bet id, so a
    second run posts nothing. Your settlement worker WILL run twice.
    """
    open_bets = (await session.execute(
        select(Bet).where(Bet.status == "open"))).scalars().all()

    settled = won = lost = 0
    house = await ledger.house_account(session)

    for bet in open_bets:
        legs = (await session.execute(
            select(BetSelection, Selection, Market, Event)
            .join(Selection, Selection.id == BetSelection.selection_id)
            .join(Market, Market.id == Selection.market_id)
            .join(Event, Event.id == Market.event_id)
            .where(BetSelection.bet_id == bet.id)
            .order_by(BetSelection.id)          # if-bet chains settle in order
        )).all()
        if not legs or any(sel.result is None for _, sel, _, _ in legs):
            continue  # still running

        if bet.type == "teaser":
            # teaser legs grade against the MOVED number, not the market line;
            # a voided leg (abandoned game) reduces just like a push
            results = []
            for bs, sel, market, event in legs:
                if sel.result == "void" or event.home_score is None:
                    bs.result = "void"
                else:
                    bs.result = exotics.grade_teased(
                        market.type, sel.key, Decimal(bs.teased_line),
                        event.home_score, event.away_score)
                results.append(bs.result)
            payout = exotics.settle_teaser(results, bet.teaser_tier or 0,
                                           bet.stake_micros)
        elif bet.type in ("if_win", "if_action"):
            chain = []
            for bs, sel, _, _ in legs:
                bs.result = sel.result
                chain.append((sel.result, Decimal(bs.odds_at_placement)))
            payout = exotics.settle_if_chain(chain, bet.stake_micros,
                                             if_action=bet.type == "if_action")
        elif bet.type == "reverse":
            chain = []
            for bs, sel, _, _ in legs:
                bs.result = sel.result
                chain.append((sel.result, Decimal(bs.odds_at_placement)))
            per_chain = bet.stake_micros // (len(legs) * (len(legs) - 1))
            payout = exotics.settle_reverse(chain, per_chain)
        else:
            factor = Decimal(1)
            for bs, sel, _, _ in legs:
                bs.result = sel.result
                factor *= result_factor(sel.result, Decimal(bs.odds_at_placement))
            payout = payout_micros(bet.stake_micros, factor)

        bet.settled_at = datetime.now(timezone.utc)

        if bet.is_free_play:
            # the FP stake is consumed win or lose; only the winnings pay, in
            # real credits. All pushes hand the free play itself back.
            if payout > bet.stake_micros:
                winnings = payout - bet.stake_micros
                bet.status, bet.payout_micros = "won", winnings
                won += 1
                wallet = await ledger.wallet_for(session, bet.user_id)
                await ledger.transfer(
                    session, idempotency_key=f"sb:{bet.id}:settle",
                    kind="bet_settle", src=house.id, dst=wallet.id,
                    amount_micros=winnings, ref_type="sports_bet", ref_id=bet.id,
                )
            elif payout == bet.stake_micros:
                bet.status, bet.payout_micros = "void", 0
                fp_wallet = await ledger.fp_wallet_for(session, bet.user_id)
                fp_house = await ledger.fp_house_account(session)
                await ledger.transfer(
                    session, idempotency_key=f"sb:{bet.id}:settle",
                    kind="freeplay_refund", src=fp_house.id, dst=fp_wallet.id,
                    amount_micros=bet.stake_micros, ref_type="sports_bet", ref_id=bet.id,
                )
            else:
                bet.status, bet.payout_micros = "lost", 0
                lost += 1
            settled += 1
            continue

        bet.payout_micros = payout
        if payout == 0:
            bet.status = "lost"
            lost += 1
        elif payout == bet.stake_micros:
            bet.status = "void"
        else:
            bet.status = "won" if payout > bet.stake_micros else "partial"
            won += 1

        if payout > 0:
            wallet = await ledger.wallet_for(session, bet.user_id)
            await ledger.transfer(
                session, idempotency_key=f"sb:{bet.id}:settle",
                kind="bet_settle", src=house.id, dst=wallet.id, amount_micros=payout,
                ref_type="sports_bet", ref_id=bet.id,
            )
        settled += 1

    await session.flush()
    return {"settled": settled, "won": won, "lost": lost}
