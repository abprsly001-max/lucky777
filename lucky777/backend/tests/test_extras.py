"""The exotic sheet: odd/even, winning margin, correct score, period spreads."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.sportsbook import extras, live
from app.sportsbook.models import Competition, Event, Market, Selection, Sport
from app.sportsbook.settlement import (grade_event, grade_period_selection,
                                       grade_selection)


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


async def _game(s, sport="soccer", odds=("1.80", "2.10")):
    sp = Sport(key=sport, name=sport.title())
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key=f"{sport}.l", name="League")
    s.add(comp); await s.flush()
    ev = Event(provider_id=f"ex-{sport}", competition_id=comp.id, home="A", away="B",
               starts_at=datetime.now(timezone.utc) + timedelta(hours=2))
    s.add(ev); await s.flush()
    m = Market(event_id=ev.id, type="h2h", name="Moneyline")
    t = Market(event_id=ev.id, type="totals", name="Total", line="2.5")
    sd = Market(event_id=ev.id, type="spreads", name="Spread", line="-4.5")
    s.add_all([m, t, sd]); await s.flush()
    s.add_all([
        Selection(market_id=m.id, key="home", name="A", odds_decimal=odds[0]),
        Selection(market_id=m.id, key="away", name="B", odds_decimal=odds[1]),
        Selection(market_id=t.id, key="over", name="Over", odds_decimal="1.91"),
        Selection(market_id=t.id, key="under", name="Under", odds_decimal="1.91"),
        Selection(market_id=sd.id, key="home", name="A -4.5", odds_decimal="1.91"),
        Selection(market_id=sd.id, key="away", name="B +4.5", odds_decimal="1.91"),
    ])
    await s.flush()
    return ev


def _mk(t, line=None):
    return Market(event_id=1, type=t, line=line, name="x")


def _sel(key):
    return Selection(market_id=1, key=key, name=key, odds_decimal="2.0")


def test_exact_grading_of_the_exotics():
    # odd / even (0-0 is even)
    assert grade_selection(_mk("odd_even"), _sel("odd"), 2, 1) == "won"
    assert grade_selection(_mk("odd_even"), _sel("even"), 0, 0) == "won"
    # winning margin bands
    assert grade_selection(_mk("winning_margin"), _sel("home:2-3"), 5, 2) == "won"
    assert grade_selection(_mk("winning_margin"), _sel("home:4+"), 9, 2) == "won"
    assert grade_selection(_mk("winning_margin"), _sel("away:1-1"), 2, 3) == "won"
    assert grade_selection(_mk("winning_margin"), _sel("home:1-1"), 2, 3) == "lost"
    assert grade_selection(_mk("winning_margin"), _sel("draw"), 1, 1) == "won"
    # a level game with no draw on the card refunds the bands
    assert grade_selection(_mk("winning_margin"), _sel("home:1-1"), 3, 3) == "void"
    # correct score, with Any Other covering everything past the grid
    assert grade_selection(_mk("correct_score"), _sel("2-1"), 2, 1) == "won"
    assert grade_selection(_mk("correct_score"), _sel("other"), 5, 1) == "won"
    assert grade_selection(_mk("correct_score"), _sel("other"), 3, 3) == "lost"
    # period spreads push on the number and grade against the scope score
    assert grade_period_selection(_mk("period:h1q:spread", "-2.5"), _sel("home"), 14, 10) == "won"
    assert grade_period_selection(_mk("period:h1q:spread", "-2.5"), _sel("away"), 12, 10) == "won"
    assert grade_period_selection(_mk("period:h1q:spread", "-2"), _sel("home"), 12, 10) == "push"


@pytest.mark.asyncio
async def test_soccer_gets_the_full_sheet_and_it_grades_at_ft(session):
    ev = await _game(session, "soccer")
    made = await extras.build_extras(session, ev, "soccer")
    assert made == 3
    types = {m.type for m in (await session.execute(
        select(Market).where(Market.event_id == ev.id))).scalars().all()}
    assert {"odd_even", "winning_margin", "correct_score"} <= types
    cs = (await session.execute(
        select(Selection).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id,
               Market.type == "correct_score"))).scalars().all()
    assert len(cs) == 17                     # 0-0..3-3 grid + Any Other
    # favourite's 1-0 must be priced shorter than the dog's 0-1
    p = {s.key: Decimal(s.odds_decimal) for s in cs}
    assert p["1-0"] < p["0-1"]

    await grade_event(session, ev, 2, 1)
    graded = (await session.execute(
        select(Selection).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id,
               Market.type.in_(("odd_even", "winning_margin", "correct_score"))
               ))).scalars().all()
    by = {s.key: s.result for s in graded}
    assert by["odd"] == "won" and by["even"] == "lost"
    assert by["home:1-1"] == "won" and by["draw"] == "lost"
    assert by["2-1"] == "won" and by["other"] == "lost"


@pytest.mark.asyncio
async def test_backfill_covers_the_board_once(session):
    ev = await _game(session, "basketball")
    n1 = await extras.backfill_extras(session)
    n2 = await extras.backfill_extras(session)
    # odd/even + margin (no correct score outside soccer) + the team totals
    assert n1 == 3 and n2 == 0
    # basketball margin market has no draw
    keys = {s.key for s in (await session.execute(
        select(Selection).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id,
               Market.type == "winning_margin"))).scalars().all()}
    assert "draw" not in keys and len(keys) == 6


@pytest.mark.asyncio
async def test_kickoff_builds_period_spreads_that_reprice(session):
    ev = await _game(session, "basketball")
    await live.go_live(session, [ev.id])
    sps = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type.like("period:%:spread")))).scalars().all()
    scopes = {m.type.split(":")[1] for m in sps}
    assert {"q1", "q2", "q3", "q4", "h1q", "h2q"} == scopes
    # the -4.5 game line scaled to a quarter is about -1: snapped to a half point
    q1 = next(m for m in sps if m.type == "period:q1:spread")
    assert Decimal(q1.line) % Decimal("0.5") == 0
    assert Decimal(q1.line) % 1 != 0
    # a big first-quarter home run moves the price off the opener
    import json
    ev.period_scores = json.dumps([{"p": "Q1", "h": 20, "a": 2}])
    sel = (await session.execute(
        select(Selection).where(Selection.market_id == q1.id,
                                Selection.key == "home"))).scalar_one()
    opening = sel.odds_decimal
    await live._process_periods(session, ev, "basketball")
    assert sel.odds_decimal != opening
    assert Decimal(sel.odds_decimal) < Decimal(opening)   # home shortened