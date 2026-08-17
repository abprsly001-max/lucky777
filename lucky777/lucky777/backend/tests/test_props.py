"""Player props: fixture generation, desk grading, and settlement."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import ledger
from app.core.money import to_micros
from app.models import Base, User
from app.sportsbook.models import Bet, Competition, Event, Market, Selection, Sport
from app.sportsbook.placement import place_bet
from app.sportsbook.providers.fixture import FixtureProvider
from app.sportsbook.settlement import grade_event, settle_bets


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


@pytest.mark.asyncio
async def test_fixture_feed_carries_props_and_pops():
    evs = await FixtureProvider().fetch_events()
    prop_types = {m.type for e in evs for m in e.markets if m.type.startswith("prop:")}
    assert "prop:pop" in prop_types and len(prop_types) >= 5
    # every pops ladder pays more the higher the target
    for e in evs:
        for m in e.markets:
            if m.type == "prop:pop":
                odds = [s.odds for s in m.selections]
                assert odds == sorted(odds)


async def _prop_game(s):
    u = User(username="p", password_hash="x", credit_limit_micros=to_micros("1000"))
    s.add(u); await s.flush()
    sp = Sport(key="baseball", name="Baseball")
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key="mlb", name="MLB")
    s.add(comp); await s.flush()
    ev = Event(provider_id="pp1", competition_id=comp.id, home="Reds", away="Cards",
               starts_at=datetime.now(timezone.utc) + timedelta(hours=2))
    s.add(ev); await s.flush()
    ml = Market(event_id=ev.id, type="h2h", name="Moneyline")
    ks = Market(event_id=ev.id, type="prop:ks", name="J. Diaz (RED) — Strikeouts",
                line="6.5")
    pop = Market(event_id=ev.id, type="prop:pop", name="J. Diaz (RED) — Strikeouts Pops",
                 line="7")
    s.add_all([ml, ks, pop]); await s.flush()
    s.add_all([
        Selection(market_id=ml.id, key="home", name="Reds", odds_decimal="1.91"),
        Selection(market_id=ml.id, key="away", name="Cards", odds_decimal="1.91"),
        Selection(market_id=ks.id, key="over", name="Over 6.5", odds_decimal="1.87"),
        Selection(market_id=ks.id, key="under", name="Under 6.5", odds_decimal="1.95"),
        Selection(market_id=pop.id, key="t7", name="7+", odds_decimal="1.90"),
        Selection(market_id=pop.id, key="t9", name="9+", odds_decimal="4.40"),
        Selection(market_id=pop.id, key="t12", name="12+", odds_decimal="11.00"),
    ])
    await s.flush()
    await ledger.wallet_for(s, u.id)
    return u, ev, ks, pop


def _grade_prop(market, sels, actual: Decimal):
    """Mirror of the desk-grading rule, applied directly for the test."""
    if market.type == "prop:pop":
        for x in sels:
            x.result = "won" if actual >= Decimal(x.key[1:]) else "lost"
            x.status = "settled"
    else:
        line = Decimal(market.line)
        for x in sels:
            if actual == line:
                x.result = "push"
            else:
                x.result = "won" if (x.key == "over") == (actual > line) else "lost"
            x.status = "settled"
    market.status = "settled"


@pytest.mark.asyncio
async def test_prop_bet_survives_the_final_score_and_settles_on_grading(session):
    u, ev, ks, pop = await _prop_game(session)
    over = (await session.execute(
        select(Selection).where(Selection.market_id == ks.id,
                                Selection.key == "over"))).scalar_one()
    bet = await place_bet(session, user_id=u.id,
                          legs=[{"selection_id": over.id, "odds": None}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="prop1", max_legs=8)

    # the game ends 5-3: the moneyline grades, the prop does NOT
    await grade_event(session, ev, 5, 3)
    await settle_bets(session)
    assert ks.status == "open"
    b = await session.get(Bet, bet.id)
    assert b.status == "open"                      # waiting on the desk

    # the desk enters 8 strikeouts: over 6.5 wins, bet pays
    sels = (await session.execute(
        select(Selection).where(Selection.market_id == ks.id))).scalars().all()
    _grade_prop(ks, sels, Decimal("8"))
    await settle_bets(session)
    b = await session.get(Bet, bet.id)
    assert b.status == "won" and b.payout_micros > 0


@pytest.mark.asyncio
async def test_pops_ladder_grades_every_rung_from_one_number(session):
    u, ev, ks, pop = await _prop_game(session)
    sels = (await session.execute(
        select(Selection).where(Selection.market_id == pop.id))).scalars().all()
    _grade_prop(pop, sels, Decimal("9"))
    by = {x.key: x.result for x in sels}
    assert by == {"t7": "won", "t9": "won", "t12": "lost"}


# ------------------------------------------------------- automatic grading ----
from app.sportsbook import props as P


@pytest.mark.asyncio
async def test_props_grade_themselves_after_full_time(session, monkeypatch):
    u, ev, ks, pop = await _prop_game(session)
    over = (await session.execute(
        select(Selection).where(Selection.market_id == ks.id,
                                Selection.key == "over"))).scalar_one()
    bet = await place_bet(session, user_id=u.id,
                          legs=[{"selection_id": over.id, "odds": None}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="auto1", max_legs=8)
    await grade_event(session, ev, 5, 3)

    monkeypatch.setattr(P, "get_stats_provider", lambda: P.FixtureStats())
    r = await P.auto_grade_props(session)
    assert r["graded"] == 2 and r["voided"] == 0        # the O/U and the pops
    assert ks.status == "settled" and pop.status == "settled"
    b = await session.get(Bet, bet.id)
    assert b.status in ("won", "lost")                   # settled, no human involved


@pytest.mark.asyncio
async def test_unanswerable_props_void_and_refund_after_the_deadline(session, monkeypatch):
    u, ev, ks, pop = await _prop_game(session)
    over = (await session.execute(
        select(Selection).where(Selection.market_id == ks.id,
                                Selection.key == "over"))).scalar_one()
    bet = await place_bet(session, user_id=u.id,
                          legs=[{"selection_id": over.id, "odds": None}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="auto2", max_legs=8)
    await grade_event(session, ev, 5, 3)

    class DeadFeed:
        async def player_stats(self, sport_key, ev):
            return None
    monkeypatch.setattr(P, "get_stats_provider", lambda: DeadFeed())

    # inside the window: stays open
    r = await P.auto_grade_props(session)
    assert r["voided"] == 0 and ks.status == "open"

    # push the game past the deadline: voids, refunds
    ev.starts_at = datetime.now(timezone.utc) - timedelta(hours=30)
    r = await P.auto_grade_props(session)
    assert r["voided"] == 2
    b = await session.get(Bet, bet.id)
    assert b.status == "void" and b.payout_micros == to_micros("10")


def test_espn_boxscore_parser_reads_the_shapes_espn_serves():
    summary = {"boxscore": {"players": [
        {"statistics": [
            {"keys": ["hits", "runs", "totalBases"],
             "athletes": [
                 {"athlete": {"displayName": "José Ramírez"},
                  "stats": ["2", "1", "5"]},
                 {"athlete": {"displayName": "Kyle Tucker"},
                  "stats": ["--", "", "1"]},
             ]},
            {"keys": ["strikeouts"],
             "athletes": [
                 {"athlete": {"displayName": "Tarik Skubal"},
                  "stats": ["9"]},
             ]},
        ]},
    ]}}
    stats = P.EspnStats.parse_boxscore(summary, "baseball")
    assert stats[P.norm_name("Jose Ramirez")]["hits"] == Decimal("2")
    assert stats[P.norm_name("José Ramírez")]["tb"] == Decimal("5")
    assert stats[P.norm_name("Tarik Skubal")]["ks"] == Decimal("9")
    assert "hits" not in stats.get(P.norm_name("Kyle Tucker"), {})


def test_market_name_parsing_and_name_matching():
    class M:
        name = "J. Diaz (RED) — Strikeouts Pops"
        type = "prop:pop"
    assert P.parse_market(M) == ("J. Diaz", "ks")
    assert P.norm_name("José Ramírez") == "jose ramirez"
