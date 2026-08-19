"""Pull from the provider and normalise into our own model.

Provider IDs are mapped, never adopted as primary keys. Price changes append to
odds_history so we can always prove what a selection was priced at.
"""
import random
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from .models import Competition, Event, Market, OddsHistory, Selection, Sport
from .providers.base import OddsProvider, ProviderEvent
from .providers.fixture import FixtureProvider


def get_provider() -> OddsProvider:
    if settings.odds_provider == "the_odds_api" and settings.odds_api_key:
        from .providers.the_odds_api import TheOddsApiProvider
        return TheOddsApiProvider(settings.odds_api_key,
                                  regions=settings.odds_regions,
                                  max_sports=settings.odds_max_sports)
    return FixtureProvider(events_per_competition=settings.fixture_events_per_competition)


async def _sport(session: AsyncSession, key: str, name: str, icon: str) -> Sport:
    s = (await session.execute(select(Sport).where(Sport.key == key))).scalar_one_or_none()
    if not s:
        s = Sport(key=key, name=name, icon=icon)
        session.add(s)
        await session.flush()
    return s


async def _competition(session: AsyncSession, sport_id: int, pc) -> Competition:
    c = (await session.execute(
        select(Competition).where(Competition.key == pc.key))).scalar_one_or_none()
    if not c:
        c = Competition(sport_id=sport_id, key=pc.key, name=pc.name, country=pc.country)
        session.add(c)
        await session.flush()
    return c


async def upsert_event(session: AsyncSession, pe: ProviderEvent) -> Event:
    sport = await _sport(session, pe.competition.sport_key,
                         pe.competition.sport_name, pe.competition.icon)
    comp = await _competition(session, sport.id, pe.competition)

    ev = (await session.execute(
        select(Event).where(Event.provider_id == pe.provider_id))).scalar_one_or_none()
    is_new = ev is None
    if not ev:
        ev = Event(provider_id=pe.provider_id, competition_id=comp.id, home=pe.home,
                   away=pe.away, starts_at=pe.starts_at, status=pe.status)
        session.add(ev)
        await session.flush()
    else:
        ev.starts_at = pe.starts_at

    for pm in pe.markets:
        mk = (await session.execute(
            select(Market).where(Market.event_id == ev.id, Market.type == pm.type,
                                 Market.line.is_(None) if pm.line is None else Market.line == pm.line)
        )).scalar_one_or_none()
        if not mk:
            mk = Market(event_id=ev.id, type=pm.type, line=pm.line, name=pm.name)
            session.add(mk)
            await session.flush()

        for ps in pm.selections:
            sel = (await session.execute(
                select(Selection).where(Selection.market_id == mk.id,
                                        Selection.key == ps.key))).scalar_one_or_none()
            price = str(min(Decimal(501), max(Decimal("1.01"), Decimal(str(ps.odds))))
                        .quantize(Decimal("0.0001")))
            if not sel:
                sel = Selection(market_id=mk.id, key=ps.key, name=ps.name, odds_decimal=price)
                session.add(sel)
                await session.flush()
                session.add(OddsHistory(selection_id=sel.id, odds_decimal=price))
            elif sel.odds_decimal != price:
                sel.odds_decimal = price
                sel.name = ps.name
                session.add(OddsHistory(selection_id=sel.id, odds_decimal=price))

    if is_new and not pe.provider_id.startswith("outright:"):
        # every new game lands with per-side totals already on the board,
        # split off the game total by the moneyline lean
        from .live import TEAM_TOTAL_SPORTS, _build_team_totals
        key = pe.competition.sport_key.split("_")[0]
        if key in TEAM_TOTAL_SPORTS:
            main_total = (await session.execute(
                select(Market).where(Market.event_id == ev.id,
                                     Market.type == "totals"))).scalars().first()
            await _build_team_totals(session, ev, key, main_total)
        # ...and the exotic sheet: odd/even, winning margin, correct score
        from .extras import build_extras
        await build_extras(session, ev, key)
    return ev


FEATURED_SPORTS = ["americanfootball_nfl", "americanfootball_ncaaf",
                   "baseball_mlb", "basketball_nba", "basketball_wnba",
                   "icehockey_nhl"]


async def sync(session: AsyncSession, sport_keys: list[str] | None = None) -> dict:
    provider = get_provider()
    if sport_keys is not None and provider.name == "the_odds_api":
        events = await provider.fetch_events(sport_keys=sport_keys)
    else:
        events = await provider.fetch_events()
    for pe in events:
        await upsert_event(session, pe)
    # games already on the board from before the exotic sheet existed
    from .extras import backfill_extras
    filled = await backfill_extras(session)
    await session.commit()
    return {"provider": provider.name, "events": len(events),
            "extras_backfilled": filled}


async def sync_live_odds(session: AsyncSession) -> dict:
    """Pull REAL in-play prices for games that are live right now.

    The moneyline stays open through the game; with enough feed credits we
    reprice it straight from the market instead of the simulator. The
    synthetic derivatives (alt ladders, period markets) keep moving off
    this anchor, so the whole live board follows real numbers."""
    provider = get_provider()
    rows = (await session.execute(
        select(Event, Competition.key)
        .join(Competition, Competition.id == Event.competition_id)
        .where(Event.status == "live",
               ~Event.provider_id.like("synth:%")))).all()
    if not rows:
        return {"live_repriced": 0, "polled_sports": 0}
    sport_keys = sorted({ck for _, ck in rows})
    feed = await provider.fetch_events(sport_keys=sport_keys)
    by_pid = {fe.provider_id: fe for fe in feed}
    repriced = 0
    for ev, _ck in rows:
        fe = by_pid.get(ev.provider_id)
        if fe is None:
            continue
        fh2h = next((m for m in fe.markets if m.type == "h2h"), None)
        if fh2h is None:
            continue
        feed_prices = {s.key: s.odds for s in fh2h.selections}
        ours = (await session.execute(
            select(Selection).join(Market, Market.id == Selection.market_id)
            .where(Market.event_id == ev.id, Market.type == "h2h",
                   Market.status == "open"))).scalars().all()
        for s in ours:
            p = feed_prices.get(s.key)
            if p is None:
                continue
            new = str(p)
            if new != s.odds_decimal:
                s.odds_decimal = new
                session.add(OddsHistory(selection_id=s.id, odds_decimal=new))
                repriced += 1
    await session.flush()
    return {"live_repriced": repriced, "polled_sports": len(sport_keys)}


async def sync_futures(session: AsyncSession) -> dict:
    """Pull every outright the feed carries -- championship winners, MVP and
    award races, division winners -- and keep their prices moving. Futures
    never touch the live engine: no kickoff, no scores, no simulator.

    Sheets the feed dropped (the race settled, the book pulled it) suspend
    so nothing dead stays bettable; a sheet that comes back reopens."""
    provider = get_provider()
    if not hasattr(provider, "fetch_futures"):
        return {"futures": 0}
    events = await provider.fetch_futures()
    for pe in events:
        await upsert_event(session, pe)
        # a returning sheet heals itself: reopen what an outage suspended
        ev = (await session.execute(select(Event).where(
            Event.provider_id == pe.provider_id))).scalar_one_or_none()
        if ev is not None:
            for mk in (await session.execute(select(Market).where(
                    Market.event_id == ev.id, Market.type == "outright",
                    Market.status == "suspended"))).scalars().all():
                mk.status = "open"

    # prune: only within sports the feed actually answered for this run, so
    # one failed call can never wipe a whole board of live futures
    pruned = 0
    if events:
        live_pids = {pe.provider_id for pe in events}
        live_comps = {pe.competition.key for pe in events}
        stale = (await session.execute(
            select(Market).join(Event, Event.id == Market.event_id)
            .join(Competition, Competition.id == Event.competition_id)
            .where(Market.type == "outright", Market.status == "open",
                   Competition.key.in_(live_comps),
                   Event.provider_id.like("outright:%"),
                   Event.provider_id.not_in(live_pids)))).scalars().all()
        for mk in stale:
            mk.status = "suspended"
            pruned += 1
    await session.flush()
    return {"futures": len(events), "pruned": pruned}


PROPS_LEAGUES = ("baseball_mlb", "basketball_nba", "basketball_wnba",
                 "americanfootball_nfl", "americanfootball_ncaaf",
                 "icehockey_nhl")


async def sync_props(session: AsyncSession, max_events: int = 40) -> dict:
    """Auto-stock player props: upcoming games in the marquee leagues that
    don't have props yet get them pulled from the feed, oldest kickoff
    first. Budgeted by max_events per run."""
    provider = get_provider()
    if not hasattr(provider, "fetch_event_props"):
        return {"pulled_events": 0, "note": "fixture feed carries its own"}
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=36)
    evs = (await session.execute(
        select(Event, Competition.key)
        .join(Competition, Competition.id == Event.competition_id)
        .where(Event.status == "scheduled",
               Competition.key.in_(PROPS_LEAGUES),
               Event.starts_at <= horizon,
               ~Event.provider_id.like("synth:%"))
        .order_by(Event.starts_at))).all()
    pulled = markets_added = 0
    for ev, comp_key in evs:
        if pulled >= max_events:
            break
        has = (await session.execute(
            select(Market.id).where(Market.event_id == ev.id,
                                    Market.type.like("prop:%")).limit(1)
        )).scalar_one_or_none()
        if has:
            continue
        try:
            pms = await provider.fetch_event_props(comp_key, ev.provider_id)
        except Exception:                                    # noqa: BLE001
            continue
        for pm in pms:
            mk = Market(event_id=ev.id, type=pm.type, line=pm.line, name=pm.name)
            session.add(mk)
            await session.flush()
            for ps in pm.selections:
                session.add(Selection(
                    market_id=mk.id, key=ps.key, name=ps.name,
                    odds_decimal=str(ps.odds.quantize(Decimal("0.0001")))))
            markets_added += 1
        pulled += 1
    await session.flush()
    return {"pulled_events": pulled, "markets_added": markets_added}


def has_live_scores(provider: OddsProvider) -> bool:
    return hasattr(provider, "fetch_scores")


async def sync_scores(session: AsyncSession, include_finals: bool = True) -> dict:
    """Drive the live board off the provider's real scores.

    A scheduled game that shows a score goes live (derivatives suspend, the
    alternate ladders build, exactly like the simulator path). Score changes
    reprice the moneyline and the ladders off the real scoreboard. A completed
    game grades and settles through the normal settlement code.
    """
    from . import live as live_engine
    from .settlement import grade_event, settle_bets

    provider = get_provider()
    if not has_live_scores(provider):
        return {"skipped": "provider has no live scores endpoint"}

    # only pay for sports that actually have a game on the clock
    now = datetime.now(timezone.utc)
    from sqlalchemy import and_, or_
    keys = (await session.execute(
        select(Competition.key)
        .join(Event, Event.competition_id == Competition.id)
        .where(or_(Event.status == "live",
                   and_(Event.status == "scheduled", Event.starts_at <= now)),
               ~Event.provider_id.like("outright:%"))
        .distinct())).scalars().all()
    if not keys:
        return {"went_live": 0, "updated": 0, "graded": 0, "polled_sports": 0}
    scores = await provider.fetch_scores(
        sport_keys=list(keys), days_from=1 if include_finals else None)
    if not scores:
        return {"went_live": 0, "updated": 0, "graded": 0,
                "polled_sports": len(keys)}

    evs = (await session.execute(
        select(Event).where(Event.status.in_(["scheduled", "live"]),
                            Event.provider_id.in_(list(scores))))).scalars().all()
    went_live = updated = graded = 0
    for ev in evs:
        h, a, done = scores[ev.provider_id]
        if done:
            await grade_event(session, ev, h, a)
            graded += 1
            continue
        if ev.status == "scheduled":
            await live_engine.go_live(session, [ev.id])
            went_live += 1
        prev_h, prev_a = ev.home_score or 0, ev.away_score or 0
        key = await live_engine._sport_key(session, ev)
        starts = ev.starts_at if ev.starts_at.tzinfo else ev.starts_at.replace(tzinfo=timezone.utc)
        frac = min(0.9, max(0.1, (now - starts).total_seconds() / (3 * 3600)))
        # estimate the period off the game clock so the line score and the
        # period markets track real innings/quarters, not one "LIVE" bucket
        from ..config import settings as _st
        ev.period = live_engine._period(key, int(frac * _st.live_total_steps),
                                        _st.live_total_steps)
        if (h, a) != (prev_h, prev_a) or went_live:
            ev.home_score, ev.away_score = h, a
            live_engine._tally_period(ev, h - prev_h, a - prev_a)
            sels = (await session.execute(
                select(Selection).join(Market, Market.id == Selection.market_id)
                .where(Market.event_id == ev.id, Market.type == "h2h",
                       Market.status == "open", Selection.status == "open")
            )).scalars().all()
            if sels:
                live_engine._reprice_h2h(random.Random(ev.provider_id), sels, key,
                                         h, a, frac)
                for sl in sels:
                    session.add(OddsHistory(selection_id=sl.id,
                                            odds_decimal=sl.odds_decimal))
            await live_engine._reprice_alts(session, ev, key, frac)
            _, pg = await live_engine._process_periods(session, ev, key)
            graded += 1 if pg else 0
            updated += 1

    result = {"went_live": went_live, "updated": updated, "graded": graded,
              "polled_sports": len(keys)}
    if graded:
        result["settlement"] = await settle_bets(session)
    await session.flush()
    return result
