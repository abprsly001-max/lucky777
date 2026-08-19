"""Per-team totals: seeded pregame, repriced live, graded off each side's score."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.money import to_micros
from app.models import Base, User
from app.sportsbook import live
from app.sportsbook.models import Competition, Event, Market, Selection, Sport
from app.sportsbook.settlement import grade_event, grade_selection


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


async def _game(s, sport="baseball", total_line="8.5"):
    u = User(username="p", password_hash="x", credit_limit_micros=to_micros("10000"))
    s.add(u); await s.flush()
    sp = Sport(key=sport, name=sport.title())
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key=f"{sport}.l", name="League")
    s.add(comp); await s.flush()
    ev = Event(provider_id="tt1", competition_id=comp.id, home="A", away="B",
               starts_at=datetime.now(timezone.utc) + timedelta(hours=2))
    s.add(ev); await s.flush()
    m = Market(event_id=ev.id, type="h2h", name="Moneyline")
    t = Market(event_id=ev.id, type="totals", name="Total", line=total_line)
    s.add_all([m, t]); await s.flush()
    s.add_all([
        Selection(market_id=m.id, key="home", name="A", odds_decimal="1.50"),
        Selection(market_id=m.id, key="away", name="B", odds_decimal="2.60"),
        Selection(market_id=t.id, key="over", name="Over", odds_decimal="1.91"),
        Selection(market_id=t.id, key="under", name="Under", odds_decimal="1.91"),
    ])
    await s.flush()
    return u, ev


def _mk(t, line):
    return Market(event_id=1, type=t, line=line, name="x")


def _sel(key):
    return Selection(market_id=1, key=key, name=key, odds_decimal="1.91")


def test_grading_reads_the_right_side_of_the_scoreboard():
    home_o = grade_selection(_mk("team_total_home", "4.5"), _sel("over"), 5, 1)
    home_u = grade_selection(_mk("team_total_home", "4.5"), _sel("under"), 5, 1)
    away_o = grade_selection(_mk("team_total_away", "4.5"), _sel("over"), 5, 1)
    assert (home_o, home_u, away_o) == ("won", "lost", "lost")
    # a whole-number line pushes on the nose
    assert grade_selection(_mk("team_total_away", "3"), _sel("over"), 9, 3) == "push"


@pytest.mark.asyncio
async def test_kickoff_builds_team_totals_favourite_expected_higher(session):
    u, ev = await _game(session)
    await live.go_live(session, [ev.id])
    tts = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type.like("team_total%")))).scalars().all()
    assert {m.type for m in tts} == {"team_total_home", "team_total_away"}
    assert all(m.status == "open" for m in tts)
    by = {m.type: Decimal(m.line) for m in tts}
    # home is the 1.50 favourite: its line must sit at or above the dog's
    assert by["team_total_home"] >= by["team_total_away"]
    # both are half-point lines that bracket a plausible share of the total
    assert all(v % 1 == Decimal("0.5") for v in by.values())


@pytest.mark.asyncio
async def test_live_repricing_suspends_a_beaten_team_total(session):
    u, ev = await _game(session)
    await live.go_live(session, [ev.id])
    tth = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "team_total_home"))).scalar_one()
    before = (await session.execute(
        select(Selection).where(Selection.market_id == tth.id,
                                Selection.key == "over"))).scalar_one().odds_decimal
    # the home side blows past its line: the over is decided, market suspends
    ev.home_score = int(Decimal(tth.line)) + 1
    ev.away_score = 0
    await live._reprice_alts(session, ev, "baseball", 0.4)
    assert tth.status == "suspended"
    # the away total is still open, and its price moved off the opener
    tta = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "team_total_away"))).scalar_one()
    assert tta.status == "open"

    # full time grades both team totals like any other market
    await grade_event(session, ev, ev.home_score, ev.away_score)
    sels = (await session.execute(
        select(Selection).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id,
               Market.type.like("team_total%")))).scalars().all()
    assert sels and all(s.result in ("won", "lost", "push") for s in sels)
    over_home = next(s for s in sels
                     if s.key == "over" and s.market_id == tth.id)
    assert over_home.result == "won"
