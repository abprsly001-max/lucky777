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
                                  regions=settings.odds_regions)
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
    return ev


async def sync(session: AsyncSession) -> dict:
    provider = get_provider()
    events = await provider.fetch_events()
    for pe in events:
        await upsert_event(session, pe)
    await session.commit()
    return {"provider": provider.name, "events": len(events)}


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
                   and_(Event.status == "scheduled", Event.starts_at <= now)))
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
        ev.period = "LIVE"
        if (h, a) != (prev_h, prev_a) or went_live:
            ev.home_score, ev.away_score = h, a
            live_engine._tally_period(ev, h - prev_h, a - prev_a)
            key = await live_engine._sport_key(session, ev)
            starts = ev.starts_at if ev.starts_at.tzinfo else ev.starts_at.replace(tzinfo=timezone.utc)
            frac = min(0.9, max(0.1, (now - starts).total_seconds() / (3 * 3600)))
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
            updated += 1

    result = {"went_live": went_live, "updated": updated, "graded": graded,
              "polled_sports": len(keys)}
    if graded:
        result["settlement"] = await settle_bets(session)
    await session.flush()
    return result
