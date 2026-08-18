import json
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..core import ledger
from ..core.money import from_micros, payout_micros, to_micros
from ..core.security import betting_user, current_master, current_user
from ..db import get_session
from ..models import User
from . import exotics, ingest, settlement
from .models import Bet, BetSelection, Competition, Event, Market, Selection, Sport
from .odds import format_american, hold, implied_probability, overround, parlay_odds
from .placement import BetRejected, place_bet

router = APIRouter(prefix="/api/sportsbook", tags=["sportsbook"])


# ------------------------------------------------------------------ catalog --
@router.get("/sports")
async def sports(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(Sport, func.count(Event.id))
        .join(Competition, Competition.sport_id == Sport.id)
        .join(Event, Event.competition_id == Competition.id)
        .where(Event.status == "scheduled")
        .group_by(Sport.id).order_by(Sport.name)
    )).all()
    await session.commit()
    return [{"key": s.key, "name": s.name, "icon": s.icon, "events": n} for s, n in rows]


@router.get("/events")
async def events(sport: str | None = None, competition: str | None = None,
                 limit: int = 40, session: AsyncSession = Depends(get_session)):
    q = (select(Event, Competition, Sport)
         .join(Competition, Competition.id == Event.competition_id)
         .join(Sport, Sport.id == Competition.sport_id)
         .where(Event.status.in_(["scheduled", "live"]))
         # live games first ("live" < "scheduled"), then soonest kickoff
         .order_by(Event.status.asc(), Event.starts_at).limit(min(limit, 200)))
    if sport:
        q = q.where(Sport.key == sport)
    if competition:
        q = q.where(Competition.key == competition)
    rows = (await session.execute(q)).all()

    import logging
    log = logging.getLogger("lucky777.board")
    out = []
    for ev, comp, sp in rows:
        # one malformed event must never blank the whole board: serialize each
        # game defensively, skip and log the ones that fail
        try:
            markets = (await session.execute(
                select(Market).where(Market.event_id == ev.id, Market.status == "open")
            )).scalars().all()
            m_out = []
            for m in markets:
                try:
                    sels = (await session.execute(
                        select(Selection).where(Selection.market_id == m.id)
                        .order_by(Selection.id)
                    )).scalars().all()
                    prices = [s.odds_decimal for s in sels]
                    m_out.append({
                        "id": m.id, "type": m.type, "name": m.name, "line": m.line,
                        "overround": str(round(overround(prices), 4)) if prices else None,
                        "hold_pct": str(round(hold(prices) * 100, 2)) if prices else None,
                        "selections": [{
                            "id": s.id, "key": s.key, "name": s.name,
                            "odds": s.odds_decimal, "american": format_american(s.odds_decimal),
                            "implied_pct": str(round(implied_probability(s.odds_decimal) * 100, 1)),
                        } for s in sels],
                    })
                except Exception:                            # noqa: BLE001
                    log.exception("skipping market %s (%s) on event %s",
                                  m.id, m.type, ev.id)
            try:
                pscores = json.loads(ev.period_scores) if ev.period_scores else []
            except ValueError:
                pscores = []
            out.append({
                "id": ev.id, "sport": sp.key, "sport_name": sp.name, "icon": sp.icon,
                "competition": comp.name, "competition_key": comp.key,
                "home": ev.home, "away": ev.away,
                "starts_at": ev.starts_at.isoformat(), "markets": m_out,
                "status": ev.status, "period": ev.period,
                "home_score": ev.home_score, "away_score": ev.away_score,
                "period_scores": pscores,
            })
        except Exception:                                    # noqa: BLE001
            log.exception("skipping unserializable event %s (%s v %s)",
                          ev.id, ev.home, ev.away)
    await session.commit()
    return out


# --------------------------------------------------------------- betting ----
class Leg(BaseModel):
    selection_id: int
    odds: str | None = None


class PlaceRequest(BaseModel):
    legs: list[Leg] = Field(..., min_length=1)
    stake: str
    accept_changes: bool = False
    idempotency_key: str | None = None
    # auto (single/parlay by leg count) | teaser | if_win | if_action | reverse
    type: str = "auto"
    teaser_tier: int | None = None   # 0=6/4pt, 1=6.5/4.5pt, 2=7/5pt
    free_play: bool = False


@router.post("/bets")
async def create_bet(req: PlaceRequest, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    try:
        stake = Decimal(req.stake)
    except InvalidOperation:
        raise HTTPException(400, "stake is not a number")
    if not user.allow_sportsbook and not user.is_admin:
        raise HTTPException(403, "sportsbook is switched off for your account - ask your agent")
    if stake < Decimal(settings.min_bet_credits):
        raise HTTPException(400, f"minimum stake is {settings.min_bet_credits}")
    # the agent's per-customer wager limit wins over the global cap when tighter
    cap = (from_micros(user.wager_limit_micros) if user.wager_limit_micros
           else Decimal(settings.max_bet_credits))
    if stake > cap:
        raise HTTPException(400, f"your limit on a single wager is {cap}")

    try:
        bet = await place_bet(
            session, user_id=user.id,
            legs=[{"selection_id": l.selection_id, "odds": l.odds} for l in req.legs],
            stake_micros=to_micros(stake), accept_changes=req.accept_changes,
            idempotency_key=req.idempotency_key or secrets.token_hex(8),
            max_legs=settings.sportsbook_max_legs,
            bet_type=req.type, teaser_tier=req.teaser_tier,
            free_play=req.free_play,
        )
    except BetRejected as e:
        await session.rollback()
        raise HTTPException(409, {"reason": e.reason, **e.detail})

    wallet = await ledger.wallet_for(session, user.id)
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {
        "bet_id": bet.id, "type": bet.type, "stake": str(from_micros(bet.stake_micros)),
        "total_odds": bet.total_odds, "potential": str(from_micros(bet.potential_micros)),
        "balance": str(from_micros(balance)),
    }


@router.get("/bets")
async def my_bets(limit: int = 40, user: User = Depends(current_user),
                  session: AsyncSession = Depends(get_session)):
    bets = (await session.execute(
        select(Bet).where(Bet.user_id == user.id)
        .order_by(desc(Bet.id)).limit(min(limit, 200)))).scalars().all()
    out = []
    for b in bets:
        legs = (await session.execute(
            select(BetSelection, Selection, Market, Event)
            .join(Selection, Selection.id == BetSelection.selection_id)
            .join(Market, Market.id == Selection.market_id)
            .join(Event, Event.id == Market.event_id)
            .where(BetSelection.bet_id == b.id)
        )).all()
        out.append({
            "bet_id": b.id, "type": b.type, "status": b.status,
            "free_play": bool(b.is_free_play),
            "stake": str(from_micros(b.stake_micros)), "total_odds": b.total_odds,
            "potential": str(from_micros(b.potential_micros)),
            "payout": str(from_micros(b.payout_micros)) if b.payout_micros is not None else None,
            "placed_at": b.placed_at.isoformat(),
            "legs": [{
                "selection": sel.name, "market": mk.name,
                "event": f"{ev.home} v {ev.away}",
                "odds": bs.odds_at_placement,       # the struck price, not the live one
                "current_odds": sel.odds_decimal,
                "result": bs.result or sel.result,
                "score": (f"{ev.home_score}-{ev.away_score}"
                          if ev.home_score is not None else None),
            } for bs, sel, mk, ev in legs],
        })
    await session.commit()
    return out


class QuoteRequest(BaseModel):
    selection_ids: list[int]
    stake: str = "10"
    type: str = "auto"
    teaser_tier: int | None = None


@router.post("/quote")
async def quote(req: QuoteRequest, session: AsyncSession = Depends(get_session)):
    """Price a slip without committing to it -- powers the live parlay total."""
    from decimal import Decimal as D

    from .models import Competition, Sport

    # preserve the slip's order (IN gives db order) -- if-bet chains care
    rows = (await session.execute(
        select(Selection).where(Selection.id.in_(req.selection_ids)))).scalars().all()
    by_id = {s.id: s for s in rows}
    if len(by_id) != len(set(req.selection_ids)):
        raise HTTPException(404, "unknown selection")
    sels = [by_id[i] for i in req.selection_ids]
    prices = [s.odds_decimal for s in sels]
    try:
        stake = Decimal(req.stake)
    except InvalidOperation:
        stake = Decimal(0)
    stake_m = to_micros(stake if stake > 0 else D(0))

    # ---- exotic quotes: fixed cards and chain math, no parlay multiplication
    if req.type == "teaser":
        if req.teaser_tier not in exotics.TEASER_POINTS:
            raise HTTPException(400, "bad teaser tier")
        teased_view = []
        for s in sels:
            mk = (await session.execute(
                select(Market).where(Market.id == s.market_id))).scalar_one()
            ev = (await session.execute(
                select(Event).where(Event.id == mk.event_id))).scalar_one()
            sport_key = (await session.execute(
                select(Sport.key).join(Competition, Competition.sport_id == Sport.id)
                .where(Competition.id == ev.competition_id))).scalar()
            pts = exotics.TEASER_POINTS[req.teaser_tier].get(sport_key or "")
            if mk.type not in exotics.TEASEABLE_MARKETS or pts is None or mk.line is None:
                raise HTTPException(400, f"'{s.name}' can't go in a teaser — "
                                         "football/basketball spreads and totals only")
            teased_view.append({
                "selection_id": s.id,
                "from_line": mk.line,
                "teased_line": str(exotics.tease_line(mk.type, s.key, D(mk.line), pts)),
            })
        price = exotics.teaser_price(req.teaser_tier, len(sels))
        if price is None:
            raise HTTPException(400, "teasers take 2 to 6 legs")
        pot = D(from_micros(payout_micros(stake_m, price)))
        return {"legs": len(sels), "total_odds": str(price),
                "american": format_american(price),
                "potential": str(pot.quantize(D("0.01"))),
                "profit": str((pot - stake).quantize(D("0.01"))),
                "margin_pct": "—", "teased": teased_view,
                "label": f"Teaser {exotics.TEASER_LABEL[req.teaser_tier]}"}

    if req.type in ("if_win", "if_action"):
        pot_m = exotics.if_chain_potential([D(p) for p in prices], stake_m)
        pot = D(from_micros(pot_m))
        return {"legs": len(sels), "total_odds": "chain",
                "american": "—",
                "potential": str(pot.quantize(D("0.01"))),
                "profit": str((pot - stake).quantize(D("0.01"))),
                "margin_pct": "—", "max_risk": str(stake),
                "label": "If-Win chain" if req.type == "if_win" else "If-Action chain"}

    if req.type == "reverse":
        n = len(sels)
        if n < 2 or n > 4:
            raise HTTPException(400, "a reverse takes 2 to 4 legs")
        cost_m = exotics.reverse_cost(n, stake_m)
        pot_m = exotics.reverse_potential([D(p) for p in prices], stake_m)
        cost, pot = D(from_micros(cost_m)), D(from_micros(pot_m))
        return {"legs": n, "total_odds": "reverse",
                "american": "—",
                "potential": str(pot.quantize(D("0.01"))),
                "profit": str((pot - cost).quantize(D("0.01"))),
                "margin_pct": "—", "cost": str(cost.quantize(D("0.01"))),
                "chains": n * (n - 1),
                "label": f"Action reverse · {n * (n - 1)} chains"}

    total = parlay_odds(prices)

    # De-margin each leg against ITS OWN market's overround, then re-multiply.
    # (Dividing a price by its own implied probability is circular and always
    # returns the price back -- it has to come from the sibling selections.)
    fair = Decimal(1)
    for s in sels:
        siblings = (await session.execute(
            select(Selection.odds_decimal).where(Selection.market_id == s.market_id)
        )).scalars().all()
        book = overround(siblings) or Decimal(1)
        fair *= Decimal(s.odds_decimal) * book
    await session.commit()
    return {
        "legs": len(sels), "total_odds": str(total),
        "american": format_american(total),
        "potential": str((stake * total).quantize(Decimal("0.01"))),
        "profit": str((stake * total - stake).quantize(Decimal("0.01"))),
        # how much margin compounds across the legs
        "margin_pct": str(round((Decimal(1) - total / fair) * 100, 2)) if fair else "0",
    }


# ----------------------------------------------------------------- admin ----
@router.post("/sync")
async def sync_feed(_: User = Depends(current_master),
                      session: AsyncSession = Depends(get_session)):
    return await ingest.sync(session)


@router.post("/drift")
async def drift_market(_: User = Depends(current_master),
                       session: AsyncSession = Depends(get_session)):
    """Simulate market movement: jitter every open price a few cents and nudge
    the occasional line half a point.

    Uses `random`, and that is fine -- this fabricates demo PRICES, never an
    outcome. It stands in for the live market a real odds feed would push, and
    it is what gives closing-line analysis something to measure.
    """
    import random as _r

    from .models import OddsHistory

    rows = (await session.execute(
        select(Selection, Market)
        .join(Market, Market.id == Selection.market_id)
        .join(Event, Event.id == Market.event_id)
        .where(Event.status == "scheduled", Market.status == "open",
               Selection.status == "open"))).all()

    # markets are unique on (event, type, line): a drifted line must not land
    # on a sibling market's number
    taken: dict[tuple[int, str], set[str]] = {}
    for m in (await session.execute(select(Market))).scalars().all():
        if m.line is not None:
            taken.setdefault((m.event_id, m.type), set()).add(m.line)

    prices_moved = 0
    lines_moved: set[int] = set()
    for sel, mkt in rows:
        old = Decimal(sel.odds_decimal)
        jitter = Decimal(str(1 + _r.uniform(-0.05, 0.05)))
        new = max(Decimal("1.01"), (old * jitter).quantize(Decimal("0.001")))
        if new != old:
            sel.odds_decimal = str(new)
            session.add(OddsHistory(selection_id=sel.id, odds_decimal=str(new)))
            prices_moved += 1
        if (mkt.line is not None and mkt.id not in lines_moved
                and _r.random() < 0.35):
            try:
                moved = str(Decimal(mkt.line) + Decimal(_r.choice(["-1", "-0.5", "0.5", "1"])))
            except InvalidOperation:
                continue
            slot = taken.setdefault((mkt.event_id, mkt.type), set())
            if moved in slot:
                continue
            slot.discard(mkt.line)
            slot.add(moved)
            mkt.line = moved
            lines_moved.add(mkt.id)

    await session.commit()
    return {"prices_moved": prices_moved, "lines_moved": len(lines_moved)}


class GoLiveRequest(BaseModel):
    count: int = 3
    event_ids: list[int] | None = None


@router.post("/live/start")
async def live_start(req: GoLiveRequest, _: User = Depends(current_master),
                     session: AsyncSession = Depends(get_session)):
    """Kick games off: scheduled -> live at 0-0. The moneyline stays open and
    reprices with the game; totals/spreads suspend at kickoff (an unpriced
    derivative in-play is free money against the book). Pregame tickets stand."""
    from . import live as live_engine
    evs = await live_engine.go_live(session, req.event_ids, req.count)
    await session.commit()
    return {"live": [{"id": e.id, "home": e.home, "away": e.away,
                      "period": e.period} for e in evs]}


@router.post("/live/tick")
async def live_tick(_: User = Depends(current_master),
                    session: AsyncSession = Depends(get_session)):
    """Advance the live clock one step by hand (the background ticker does
    this automatically every few seconds while the server runs)."""
    from . import live as live_engine
    r = await live_engine.tick(session)
    await session.commit()
    return r


class SimulateRequest(BaseModel):
    count: int = 5
    event_ids: list[int] | None = None


@router.post("/simulate")
async def simulate(req: SimulateRequest, _: User = Depends(current_master),
                   session: AsyncSession = Depends(get_session)):
    """End some events, grade every selection, then settle the bets.

    Stands in for the results feed. In production this is a worker polling
    scores; the grading and settlement code underneath is identical.
    """
    now = datetime.now(timezone.utc)
    if req.event_ids:
        q = select(Event).where(Event.id.in_(req.event_ids))
    else:
        # anything that has kicked off, else just the soonest, so a demo always works
        q = (select(Event).where(Event.status == "scheduled", Event.starts_at <= now)
             .limit(req.count))
        if not (await session.execute(q)).scalars().all():
            q = (select(Event).where(Event.status == "scheduled")
                 .order_by(Event.starts_at).limit(req.count))
    evs = (await session.execute(q)).scalars().all()
    if not evs:
        await session.commit()
        return {"graded": 0, "settlement": {"settled": 0, "won": 0, "lost": 0}}

    provider = ingest.get_provider()
    results = await provider.fetch_results([e.provider_id for e in evs])

    graded = []
    for ev in evs:
        score = results.get(ev.provider_id)
        if score is None:
            continue
        await settlement.grade_event(session, ev, score[0], score[1])
        graded.append({"event": f"{ev.home} v {ev.away}", "score": f"{score[0]}-{score[1]}"})

    report = await settlement.settle_bets(session)
    await session.commit()
    return {"graded": len(graded), "events": graded, "settlement": report}


@router.post("/props/pull/{event_id}")
async def pull_props(event_id: int, _: User = Depends(current_master),
                     session: AsyncSession = Depends(get_session)):
    """Fetch real player props for one event from the feed (costs credits).
    The fixture feed already carries generated props, so this is a no-op there."""
    ev = await session.get(Event, event_id)
    if ev is None:
        raise HTTPException(404, "no such event")
    provider = ingest.get_provider()
    if not hasattr(provider, "fetch_event_props"):
        await session.commit()
        return {"pulled": 0, "note": "fixture feed already includes props"}
    comp = await session.get(Competition, ev.competition_id)
    pms = await provider.fetch_event_props(comp.key, ev.provider_id)
    n = 0
    for pm in pms:
        mk = (await session.execute(
            select(Market).where(Market.event_id == ev.id, Market.type == pm.type,
                                 Market.name == pm.name))).scalars().first()
        if not mk:
            mk = Market(event_id=ev.id, type=pm.type, line=pm.line, name=pm.name)
            session.add(mk)
            await session.flush()
        for ps in pm.selections:
            sel = (await session.execute(
                select(Selection).where(Selection.market_id == mk.id,
                                        Selection.key == ps.key))).scalars().first()
            price = str(ps.odds.quantize(Decimal("0.0001")))
            if not sel:
                session.add(Selection(market_id=mk.id, key=ps.key,
                                      name=ps.name, odds_decimal=price))
            else:
                sel.odds_decimal = price
        n += 1
    await session.commit()
    return {"pulled": n}


@router.get("/exposure")
async def exposure(_: User = Depends(current_master),
                      session: AsyncSession = Depends(get_session)):
    """Per-selection liability: what the book pays if this one comes in.

    A balanced book earns the hold whatever happens. An unbalanced one is
    gambling against its own customers, which is the thing a book exists to
    avoid doing.
    """
    rows = (await session.execute(
        select(Selection, Market, Event, BetSelection, Bet)
        .join(Market, Market.id == Selection.market_id)
        .join(Event, Event.id == Market.event_id)
        .join(BetSelection, BetSelection.selection_id == Selection.id)
        .join(Bet, Bet.id == BetSelection.bet_id)
        .where(Bet.status == "open")
    )).all()

    agg: dict[int, dict] = {}
    for sel, mk, ev, bs, bet in rows:
        e = agg.setdefault(sel.id, {
            "selection": sel.name, "market": mk.name,
            "event": f"{ev.home} v {ev.away}", "odds": sel.odds_decimal,
            "bets": 0, "staked_micros": 0, "liability_micros": 0,
        })
        e["bets"] += 1
        e["staked_micros"] += bet.stake_micros
        e["liability_micros"] += bet.potential_micros

    await session.commit()
    out = [{
        "selection": v["selection"], "market": v["market"], "event": v["event"],
        "odds": v["odds"], "bets": v["bets"],
        "staked": str(from_micros(v["staked_micros"])),
        "liability": str(from_micros(v["liability_micros"])),
    } for v in agg.values()]
    out.sort(key=lambda r: Decimal(r["liability"]), reverse=True)
    return {"positions": out,
            "total_liability": str(from_micros(sum(v["liability_micros"] for v in agg.values())))}
