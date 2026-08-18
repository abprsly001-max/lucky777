"""Real-feed flow: provider scores drive live status, repricing and grading."""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import ledger
from app.core.money import to_micros
from app.models import Base, User
from app.sportsbook import ingest
from app.sportsbook.models import Competition, Event, Market, Selection, Sport


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


class StubProvider:
    name = "stub"
    scores: dict = {}

    async def fetch_events(self):
        return []

    polled: list = []

    async def fetch_scores(self, sport_keys=None, days_from=None):
        StubProvider.polled = sport_keys or []
        return self.scores


async def _game(s):
    u = User(username="p", password_hash="x", credit_limit_micros=to_micros("1000"))
    s.add(u); await s.flush()
    sp = Sport(key="baseball", name="Baseball")
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key="baseball_mlb", name="MLB")
    s.add(comp); await s.flush()
    ev = Event(provider_id="real-1", competition_id=comp.id, home="Reds", away="Cards",
               starts_at=datetime.now(timezone.utc) - timedelta(minutes=30))
    s.add(ev); await s.flush()
    m = Market(event_id=ev.id, type="h2h", name="Moneyline")
    t = Market(event_id=ev.id, type="totals", name="Total", line="8.5")
    s.add_all([m, t]); await s.flush()
    s.add_all([
        Selection(market_id=m.id, key="home", name="Reds", odds_decimal="3.20"),
        Selection(market_id=m.id, key="away", name="Cards", odds_decimal="1.36"),
        Selection(market_id=t.id, key="over", name="Over", odds_decimal="1.91"),
        Selection(market_id=t.id, key="under", name="Under", odds_decimal="1.91"),
    ])
    await s.flush()
    await ledger.wallet_for(s, u.id)
    return u, ev, m


@pytest.mark.asyncio
async def test_feed_scores_take_a_game_live_then_grade_it(session, monkeypatch):
    u, ev, m = await _game(session)
    monkeypatch.setattr(ingest, "get_provider", lambda: StubProvider())

    # first poll: game underway 1-0 -> live, ladders built, real score on board
    StubProvider.scores = {"real-1": (1, 0, False)}
    r = await ingest.sync_scores(session)
    assert r["went_live"] == 1
    assert StubProvider.polled == ["baseball_mlb"]   # only the sport in play
    assert ev.status == "live" and (ev.home_score, ev.away_score) == (1, 0)
    assert ev.period == "LIVE"
    alts = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "alt_totals"))).scalars().all()
    assert len(alts) == 7

    # the moneyline repriced off the real score: the leader got shorter
    home = (await session.execute(
        select(Selection).where(Selection.market_id == m.id,
                                Selection.key == "home"))).scalar_one()
    assert float(home.odds_decimal) < 3.20

    # final poll: 5-3 final -> graded and settled through normal settlement
    StubProvider.scores = {"real-1": (5, 3, True)}
    r = await ingest.sync_scores(session)
    assert r["graded"] == 1
    assert ev.status == "ended" and (ev.home_score, ev.away_score) == (5, 3)
    sel = (await session.execute(
        select(Selection).where(Selection.market_id == m.id,
                                Selection.key == "home"))).scalar_one()
    assert sel.result == "won"


@pytest.mark.asyncio
async def test_feed_without_scores_endpoint_is_a_noop(session, monkeypatch):
    class NoScores:
        name = "fixture"
        async def fetch_events(self):
            return []
    monkeypatch.setattr(ingest, "get_provider", lambda: NoScores())
    r = await ingest.sync_scores(session)
    assert "skipped" in r
