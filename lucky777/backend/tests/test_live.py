"""The live engine: games kick off, tick, reprice, and grade themselves."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core import ledger
from app.core.money import to_micros
from app.models import Base, User
from app.sportsbook import live
from app.sportsbook.models import (
    Bet, Competition, Event, Market, Selection, Sport,
)
from app.sportsbook.placement import place_bet


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


async def _game(s, sport="soccer"):
    u = User(username="p", password_hash="x", credit_limit_micros=to_micros("10000"))
    s.add(u); await s.flush()
    sp = Sport(key=sport, name=sport.title())
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key=f"{sport}.l", name="League")
    s.add(comp); await s.flush()
    ev = Event(provider_id="lv1", competition_id=comp.id, home="A", away="B",
               starts_at=datetime.now(timezone.utc) + timedelta(hours=2))
    s.add(ev); await s.flush()
    m = Market(event_id=ev.id, type="h2h", name="Moneyline")
    t = Market(event_id=ev.id, type="totals", name="Total", line="2.5")
    s.add_all([m, t]); await s.flush()
    sh = Selection(market_id=m.id, key="home", name="A", odds_decimal="1.91")
    sa = Selection(market_id=m.id, key="away", name="B", odds_decimal="1.91")
    so = Selection(market_id=t.id, key="over", name="Over", odds_decimal="1.91")
    su = Selection(market_id=t.id, key="under", name="Under", odds_decimal="1.91")
    s.add_all([sh, sa, so, su]); await s.flush()
    await ledger.wallet_for(s, u.id)
    return u, ev, m, t, (sh, sa)


@pytest.mark.asyncio
async def test_kickoff_suspends_derivatives_but_not_the_moneyline(session):
    u, ev, m, t, _ = await _game(session)
    await live.go_live(session, [ev.id])
    assert ev.status == "live" and ev.home_score == 0
    assert m.status == "open"
    assert t.status == "suspended"


@pytest.mark.asyncio
async def test_game_runs_to_full_time_and_settles_the_tickets(session):
    u, ev, m, t, (sh, sa) = await _game(session)
    # one pregame ticket on the total, one on the moneyline
    pre = await place_bet(session, user_id=u.id, legs=[{"selection_id": sh.id}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="pre")
    await live.go_live(session, [ev.id])

    # a live ticket struck mid-game at the live number
    for _ in range(3):
        await live.tick(session)
    mid = await place_bet(session, user_id=u.id, legs=[{"selection_id": sa.id}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="mid")

    for _ in range(settings.live_total_steps):
        await live.tick(session)

    assert ev.status == "ended"
    assert ev.period == "FT"
    for b in (await session.execute(select(Bet))).scalars().all():
        assert b.status != "open"          # everything graded, nothing stuck
    # both tickets resolved to a terminal state
    assert {pre.status, mid.status} <= {"won", "lost", "void", "partial"}


@pytest.mark.asyncio
async def test_live_repricing_moves_toward_the_leader(session):
    u, ev, m, t, (sh, sa) = await _game(session)
    await live.go_live(session, [ev.id])
    before = Decimal(sh.odds_decimal)
    ev.home_score, ev.away_score, ev.live_step = 3, 0, 9   # home runs away with it
    import random
    live._reprice_h2h(random.Random(1), [sh, sa], "soccer", 3, 0, 0.5)
    assert Decimal(sh.odds_decimal) < before               # leader shortens
    assert Decimal(sa.odds_decimal) > Decimal("2.5")       # trailer drifts


import json


@pytest.mark.asyncio
async def test_go_live_builds_alt_ladders_and_line_score(session):
    u, ev, m, t, _ = await _game(session)
    await live.go_live(session, [ev.id])

    alts = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "alt_totals",
                             Market.status == "open"))).scalars().all()
    lines = sorted(float(x.line) for x in alts)
    assert len(lines) == len(live.ALT_OFFSETS) and lines == sorted(set(lines))
    assert ev.period_scores == "[]"

    for _ in range(6):
        await live.tick(session)
    rows = json.loads(ev.period_scores)
    assert sum(r["h"] for r in rows) == ev.home_score
    assert sum(r["a"] for r in rows) == ev.away_score


@pytest.mark.asyncio
async def test_alt_total_suspends_once_passed(session):
    u, ev, m, t, _ = await _game(session)
    await live.go_live(session, [ev.id])
    alts = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "alt_totals"))).scalars().all()
    lowest = min(alts, key=lambda x: float(x.line))
    ev.home_score = int(float(lowest.line)) + 3
    ev.away_score = 0
    await live._reprice_alts(session, ev, "soccer", 0.5)
    assert lowest.status == "suspended"


@pytest.mark.asyncio
async def test_alt_ladder_prices_step_with_the_line(session):
    # friendlier totals lines must price the over shorter, rung by rung
    u, ev, m, t, _ = await _game(session)
    await live.go_live(session, [ev.id])
    rows = (await session.execute(
        select(Selection, Market).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id, Market.type == "alt_totals",
               Selection.key == "over"))).all()
    by_line = sorted(((float(mk.line), float(sel.odds_decimal)) for sel, mk in rows))
    odds = [o for _, o in by_line]
    assert odds == sorted(odds)   # higher line -> longer over


@pytest.mark.asyncio
async def test_bare_moneyline_game_still_gets_a_full_live_board(session):
    """A game the feed only priced h2h synthesizes spread + total ladders."""
    u = User(username="q2", password_hash="x", credit_limit_micros=to_micros("10000"))
    session.add(u); await session.flush()
    sp = Sport(key="tennis", name="Tennis")
    session.add(sp); await session.flush()
    comp = Competition(sport_id=sp.id, key="tennis.atp", name="ATP")
    session.add(comp); await session.flush()
    ev = Event(provider_id="lv2", competition_id=comp.id, home="A", away="B",
               starts_at=datetime.now(timezone.utc) + timedelta(hours=1))
    session.add(ev); await session.flush()
    m = Market(event_id=ev.id, type="h2h", name="Moneyline")
    session.add(m); await session.flush()
    session.add_all([
        Selection(market_id=m.id, key="home", name="A", odds_decimal="1.50"),
        Selection(market_id=m.id, key="away", name="B", odds_decimal="2.60"),
    ])
    await session.flush()

    await live.go_live(session, [ev.id])
    spreads = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "alt_spreads",
                             Market.status == "open"))).scalars().all()
    totals = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "alt_totals",
                             Market.status == "open"))).scalars().all()
    assert len(spreads) == len(live.ALT_OFFSETS)
    assert len(totals) == len(live.ALT_OFFSETS)


@pytest.mark.asyncio
async def test_total_ladder_refills_as_the_score_climbs(session):
    u, ev, m, t, _ = await _game(session)
    await live.go_live(session, [ev.id])
    # blow past every rung of the opening ladder
    ev.home_score, ev.away_score, ev.live_step = 4, 3, 10
    await live._reprice_alts(session, ev, "soccer", 0.5)
    open_totals = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "alt_totals",
                             Market.status == "open"))).scalars().all()
    assert len(open_totals) >= 5
    assert all(float(mm.line) >= 6 for mm in open_totals)
