"""Player cash out: the book buys an open ticket back at market, minus its cut."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import ledger
from app.core.money import to_micros
from app.models import Base, User
from app.sportsbook.models import Bet, Competition, Event, Market, Selection, Sport
from app.sportsbook.placement import place_bet
from app.sportsbook.router import CASHOUT_MARGIN, _cashout_quote
from app.sportsbook.settlement import settle_bets


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


async def _board(s, n_events=2):
    """A user plus n one-market events, each a two-way h2h at 2.00/2.00."""
    u = User(username="p", password_hash="x", credit_limit_micros=to_micros("10000"))
    s.add(u); await s.flush()
    sp = Sport(key="soccer", name="Soccer")
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key="soccer.l", name="League")
    s.add(comp); await s.flush()
    sels = []
    for i in range(n_events):
        ev = Event(provider_id=f"co{i}", competition_id=comp.id, home=f"H{i}",
                   away=f"A{i}",
                   starts_at=datetime.now(timezone.utc) + timedelta(hours=2))
        s.add(ev); await s.flush()
        m = Market(event_id=ev.id, type="h2h", name="Moneyline")
        s.add(m); await s.flush()
        sh = Selection(market_id=m.id, key="home", name=f"H{i}", odds_decimal="2.00")
        sa = Selection(market_id=m.id, key="away", name=f"A{i}", odds_decimal="2.00")
        s.add_all([sh, sa]); await s.flush()
        sels.append((ev, m, sh, sa))
    await ledger.wallet_for(s, u.id)
    return u, sels


@pytest.mark.asyncio
async def test_single_quote_moves_with_the_live_price(session):
    u, [(ev, m, sh, sa)] = await _board(session, 1)
    bet = await place_bet(session, user_id=u.id, legs=[{"selection_id": sh.id}],
                          stake_micros=to_micros("100"), accept_changes=True,
                          idempotency_key="k1")
    # price unchanged: fair value is the stake, offer is stake x margin
    q = await _cashout_quote(session, bet)
    assert q == to_micros(Decimal("100") * CASHOUT_MARGIN)
    # the pick shortens 2.00 -> 1.50: ticket is now worth more than the stake
    sh.odds_decimal = "1.50"
    q2 = await _cashout_quote(session, bet)
    assert q2 == to_micros(Decimal("100") * Decimal("2.00") / Decimal("1.50")
                           * CASHOUT_MARGIN)
    assert q2 > q
    # ...and it can never quote above the ticket's own ceiling
    sh.odds_decimal = "1.01"
    assert (await _cashout_quote(session, bet)) <= bet.potential_micros


@pytest.mark.asyncio
async def test_parlay_with_a_won_leg_cashes_out_and_stays_settled(session):
    u, sels = await _board(session, 2)
    (ev1, m1, sh1, _), (ev2, m2, sh2, _) = sels
    bet = await place_bet(
        session, user_id=u.id,
        legs=[{"selection_id": sh1.id}, {"selection_id": sh2.id}],
        stake_micros=to_micros("50"), accept_changes=True, idempotency_key="k2")
    # first leg wins outright
    sh1.result, sh1.status, m1.status = "won", "settled", "settled"
    q = await _cashout_quote(session, bet)
    # 50 x 2.00 (banked leg) x 2.00/2.00 (running leg) x margin
    assert q == to_micros(Decimal("50") * Decimal("2.00") * CASHOUT_MARGIN)

    # execute exactly like the endpoint does
    bet.status = "buyout"
    bet.payout_micros = q
    house = await ledger.house_account(session)
    wallet = await ledger.wallet_for(session, bet.user_id)
    await ledger.transfer(session, idempotency_key=f"sb:{bet.id}:settle",
                          kind="bet_cashout", src=house.id, dst=wallet.id,
                          amount_micros=q, ref_type="sports_bet", ref_id=bet.id)
    # the second leg later loses -- settlement must NOT touch the bought ticket
    sh2.result, sh2.status, m2.status = "lost", "settled", "settled"
    report = await settle_bets(session)
    assert report["settled"] == 0
    assert bet.status == "buyout" and bet.payout_micros == q
    # and the shared idempotency key means a stray settle pays nothing extra
    bal = await ledger.balance_of(session, wallet.id)
    assert bal == q - to_micros("50")            # stake went out at placement


@pytest.mark.asyncio
async def test_no_quote_on_dead_suspended_or_freeplay_tickets(session):
    u, sels = await _board(session, 2)
    (ev1, m1, sh1, _), (ev2, m2, sh2, _) = sels
    # a lost leg kills the offer
    bet = await place_bet(session, user_id=u.id, legs=[{"selection_id": sh1.id}],
                          stake_micros=to_micros("10"), accept_changes=True,
                          idempotency_key="k3")
    sh1.result = "lost"
    assert await _cashout_quote(session, bet) is None
    # a suspended market means the book can't price the close
    bet2 = await place_bet(session, user_id=u.id, legs=[{"selection_id": sh2.id}],
                           stake_micros=to_micros("10"), accept_changes=True,
                           idempotency_key="k4")
    m2.status = "suspended"
    assert await _cashout_quote(session, bet2) is None
    m2.status = "open"
    # free plays never cash out
    bet2.is_free_play = 1
    assert await _cashout_quote(session, bet2) is None
