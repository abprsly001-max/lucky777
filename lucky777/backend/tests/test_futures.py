"""Futures (outrights): synced from the feed, never touched by the live engine."""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.sportsbook import ingest, live
from app.sportsbook.extras import backfill_extras
from app.sportsbook.models import Event, Market, Selection


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


@pytest.mark.asyncio
async def test_fixture_futures_stock_the_board(session):
    r = await ingest.sync_futures(session)
    assert r["futures"] > 10                 # a title race per league + MVPs
    evs = (await session.execute(
        select(Event).where(Event.provider_id.like("outright:%")))).scalars().all()
    assert evs and all(e.away == "Futures" for e in evs)
    # every futures event carries exactly one multi-way outright market
    for ev in evs[:5]:
        ms = (await session.execute(
            select(Market).where(Market.event_id == ev.id))).scalars().all()
        assert [m.type for m in ms] == ["outright"]
        sels = (await session.execute(
            select(Selection).where(Selection.market_id == ms[0].id))).scalars().all()
        assert len(sels) >= 5
    # re-sync is idempotent: prices refresh, nothing duplicates
    n1 = len(evs)
    await ingest.sync_futures(session)
    n2 = (await session.execute(
        select(Event).where(Event.provider_id.like("outright:%")))).scalars().all()
    assert len(n2) == n1


@pytest.mark.asyncio
async def test_dropped_sheets_suspend_and_returning_ones_reopen(session):
    await ingest.sync_futures(session)
    # a sheet the feed no longer carries, in a league the feed DID answer for
    comp_id = (await session.execute(
        select(Event.competition_id).where(
            Event.provider_id == "outright:epl:champ"))).scalar_one()
    ghost = Event(provider_id="outright:epl:dead-race", competition_id=comp_id,
                  home="EPL — Old Race", away="Futures",
                  starts_at=datetime.now(timezone.utc) + timedelta(days=90))
    session.add(ghost); await session.flush()
    gm = Market(event_id=ghost.id, type="outright", name="Old Race", status="open")
    session.add(gm); await session.flush()
    session.add(Selection(market_id=gm.id, key="x", name="X", odds_decimal="2.0"))
    r = await ingest.sync_futures(session)
    assert r["pruned"] >= 1
    assert gm.status == "suspended"
    # a live sheet knocked out by an outage heals on the next pass
    champ = (await session.execute(
        select(Market).join(Event, Event.id == Market.event_id)
        .where(Event.provider_id == "outright:epl:champ",
               Market.type == "outright"))).scalars().first()
    champ.status = "suspended"
    await ingest.sync_futures(session)
    assert champ.status == "open"


@pytest.mark.asyncio
async def test_engines_leave_futures_alone(session):
    await ingest.sync_futures(session)
    fut = (await session.execute(
        select(Event).where(Event.provider_id.like("outright:%")))).scalars().all()
    # force a near post time: still must never kick off
    for ev in fut:
        ev.starts_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await live.go_live(session, None, count=50)
    assert all(e.status == "scheduled" for e in fut)
    await live.go_live(session, [fut[0].id])            # even by explicit id
    assert fut[0].status == "scheduled"
    # the exotics backfill skips them too: no odd/even on a futures sheet
    await backfill_extras(session)
    oe = (await session.execute(
        select(Market).join(Event, Event.id == Market.event_id)
        .where(Event.provider_id.like("outright:%"),
               Market.type != "outright"))).scalars().all()
    assert oe == []
