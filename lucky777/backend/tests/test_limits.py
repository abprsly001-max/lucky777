"""Book-wide wagering limits: the caps every ticket must pass through."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import ledger
from app.core.money import to_micros
from app.models import Base, User
from app.sportsbook.models import Competition, Event, Market, Selection, Sport
from app.sportsbook.placement import BetRejected, _american, get_book_limits, place_bet


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


async def _fixture(s, *, odds=("1.91", "1.91")):
    """A funded customer and one open two-way market."""
    u = User(username="punter", password_hash="x", credit_limit_micros=to_micros("100000"))
    s.add(u)
    await s.flush()
    sp = Sport(key="foo", name="Foo")
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key="foo.l", name="League")
    s.add(comp); await s.flush()
    ev = Event(provider_id="e1", competition_id=comp.id, home="A", away="B",
               starts_at=datetime.now(timezone.utc) + timedelta(hours=4))
    s.add(ev); await s.flush()
    m = Market(event_id=ev.id, type="h2h", name="Moneyline")
    s.add(m); await s.flush()
    sels = []
    for i, o in enumerate(odds):
        sel = Selection(market_id=m.id, key=f"k{i}", name=f"S{i}", odds_decimal=o)
        s.add(sel)
        sels.append(sel)
    await s.flush()
    await ledger.wallet_for(s, u.id)
    return u, ev, sels


def test_american_conversion():
    assert _american(Decimal("2.00")) == 100
    assert _american(Decimal("1.20")) == -500
    assert _american(Decimal("6.00")) == 500


@pytest.mark.asyncio
async def test_stake_over_book_max_is_rejected(session):
    u, _, sels = await _fixture(session)
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[0].id}],
                        stake_micros=to_micros("501"), accept_changes=True,
                        idempotency_key="k1")
    assert e.value.reason == "stake_over_max"


@pytest.mark.asyncio
async def test_favorite_steeper_than_cap_is_rejected(session):
    u, _, sels = await _fixture(session, odds=("1.10", "8.0"))   # -1000 favorite
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[0].id}],
                        stake_micros=to_micros("10"), accept_changes=True,
                        idempotency_key="k2")
    assert e.value.reason == "line_too_steep"


@pytest.mark.asyncio
async def test_dog_longer_than_cap_is_rejected_on_straights(session):
    u, _, sels = await _fixture(session, odds=("1.10", "8.0"))   # +700 dog, cap +400
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[1].id}],
                        stake_micros=to_micros("10"), accept_changes=True,
                        idempotency_key="k3")
    assert e.value.reason == "line_too_long"


@pytest.mark.asyncio
async def test_offering_cap_counts_open_position(session):
    """Two 500s on the same selection blow through the 1,000 offering cap
    only on the third try."""
    u, _, sels = await _fixture(session)
    for i in range(2):
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[0].id}],
                        stake_micros=to_micros("500"), accept_changes=True,
                        idempotency_key=f"o{i}")
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[0].id}],
                        stake_micros=to_micros("1"), accept_changes=True,
                        idempotency_key="o3")
    assert e.value.reason == "over_offering_limit"


@pytest.mark.asyncio
async def test_live_parlays_can_be_switched_off(session):
    """Pregame parlays always write; the Live Parlays toggle only gates parlays
    with an in-play leg."""
    u, ev, sels = await _fixture(session)
    # second event so the parlay isn't rejected as correlated
    ev2 = Event(provider_id="e2", competition_id=ev.competition_id, home="C", away="D",
                starts_at=datetime.now(timezone.utc) + timedelta(hours=4))
    session.add(ev2); await session.flush()
    m2 = Market(event_id=ev2.id, type="h2h", name="Moneyline")
    session.add(m2); await session.flush()
    s2 = Selection(market_id=m2.id, key="h", name="C", odds_decimal="1.91")
    session.add(s2); await session.flush()

    lim = await get_book_limits(session)
    lim.live_parlays = 0

    # both legs pregame: fine even with the toggle off
    bet = await place_bet(session, user_id=u.id,
                          legs=[{"selection_id": sels[0].id}, {"selection_id": s2.id}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="p0")
    assert bet.type == "parlay"

    ev2.status, ev2.period = "live", "1H"
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id,
                        legs=[{"selection_id": sels[1].id}, {"selection_id": s2.id}],
                        stake_micros=to_micros("10"), accept_changes=True,
                        idempotency_key="p1")
    assert e.value.reason == "live_parlays_off"


@pytest.mark.asyncio
async def test_live_game_takes_bets_and_halftime_can_block(session):
    u, ev, sels = await _fixture(session)
    ev.status, ev.period = "live", "1H"
    ev.home_score = ev.away_score = 0
    bet = await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[0].id}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="lv1")
    assert bet.status == "open"

    lim = await get_book_limits(session)
    lim.block_halftime = 1
    ev.period = "HT"
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[1].id}],
                        stake_micros=to_micros("10"), accept_changes=True,
                        idempotency_key="lv2")
    assert e.value.reason == "halftime_blocked"


@pytest.mark.asyncio
async def test_block_prior_to_start_makes_the_book_live_only(session):
    u, ev, sels = await _fixture(session)
    lim = await get_book_limits(session)
    lim.block_prior_start = 1
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[0].id}],
                        stake_micros=to_micros("10"), accept_changes=True,
                        idempotency_key="bp1")
    assert e.value.reason == "pregame_blocked"


@pytest.mark.asyncio
async def test_cooloff_spaces_out_wagers(session):
    u, _, sels = await _fixture(session)
    lim = await get_book_limits(session)
    lim.cooloff_sec = 3600
    await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[0].id}],
                    stake_micros=to_micros("10"), accept_changes=True,
                    idempotency_key="c1")
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sels[1].id}],
                        stake_micros=to_micros("10"), accept_changes=True,
                        idempotency_key="c2")
    assert e.value.reason == "cooloff"
