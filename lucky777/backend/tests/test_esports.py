"""The house esports circuit runs itself: schedule, kickoff, play, settle."""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Base
from app.sportsbook import esports, live
from app.sportsbook.models import Event, Market, Selection


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


@pytest.mark.asyncio
async def test_schedule_stocks_every_league(session):
    made = await esports.ensure_schedule(session)
    assert made == esports.MATCHES_AHEAD * len(esports.LEAGUES)
    evs = (await session.execute(select(Event))).scalars().all()
    assert all(e.provider_id.startswith(esports.SYNTH_PREFIX) for e in evs)
    # every fixture priced: match winner + map total
    for e in evs:
        ms = (await session.execute(
            select(Market).where(Market.event_id == e.id))).scalars().all()
        assert {m.type for m in ms} == {"h2h", "totals"}
    # a second run adds nothing while the board is stocked
    assert await esports.ensure_schedule(session) == 0


@pytest.mark.asyncio
async def test_match_goes_live_plays_and_settles(session):
    await esports.ensure_schedule(session)
    ev = (await session.execute(select(Event).limit(1))).scalar_one()
    ev.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await session.flush()

    assert await esports.kickoff_due(session) == 1
    assert ev.status == "live"

    for _ in range(settings.live_total_steps):
        await live.tick(session, synthetic_only=True)
    assert ev.status == "ended"
    assert ev.home_score != ev.away_score          # maps can't tie
    sels = (await session.execute(
        select(Selection).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id))).scalars().all()
    assert sels and all(s.result is not None for s in sels)


@pytest.mark.asyncio
async def test_synthetic_only_leaves_real_games_alone(session):
    from app.sportsbook.models import Competition, Sport
    sp = Sport(key="soccer", name="Soccer"); session.add(sp); await session.flush()
    comp = Competition(sport_id=sp.id, key="soccer_x", name="X")
    session.add(comp); await session.flush()
    real = Event(provider_id="real-1", competition_id=comp.id, home="A", away="B",
                 starts_at=datetime.now(timezone.utc), status="live",
                 home_score=0, away_score=0, live_step=0, period_scores="[]")
    session.add(real); await session.flush()
    await live.tick(session, synthetic_only=True)
    assert real.live_step == 0                     # untouched
