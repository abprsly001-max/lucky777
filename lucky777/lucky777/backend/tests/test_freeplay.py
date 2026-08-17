"""Free play: separate money, winnings-only payouts, and no figure pollution."""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import ledger
from app.core.money import to_micros
from app.models import Base, User
from app.sportsbook.models import Competition, Event, Market, Selection, Sport
from app.sportsbook.placement import BetRejected, place_bet
from app.sportsbook.settlement import grade_event, settle_bets


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


async def _setup(s):
    u = User(username="p", password_hash="x", credit_limit_micros=to_micros("1000"))
    s.add(u); await s.flush()
    sp = Sport(key="soccer", name="Soccer")
    s.add(sp); await s.flush()
    comp = Competition(sport_id=sp.id, key="l", name="L")
    s.add(comp); await s.flush()
    ev = Event(provider_id="e1", competition_id=comp.id, home="A", away="B",
               starts_at=datetime.now(timezone.utc) + timedelta(hours=2))
    s.add(ev); await s.flush()
    m = Market(event_id=ev.id, type="h2h", name="ML")
    s.add(m); await s.flush()
    sh = Selection(market_id=m.id, key="home", name="A", odds_decimal="2.50")
    sa = Selection(market_id=m.id, key="away", name="B", odds_decimal="1.55")
    s.add_all([sh, sa]); await s.flush()
    wallet = await ledger.wallet_for(s, u.id)
    fp = await ledger.fp_wallet_for(s, u.id)
    fp_house = await ledger.fp_house_account(s)
    await ledger.transfer(s, idempotency_key="fp1", kind="freeplay_issue",
                          src=fp_house.id, dst=fp.id, amount_micros=to_micros("50"))
    return u, ev, sh, sa, wallet, fp


@pytest.mark.asyncio
async def test_fp_and_cash_can_never_mix_in_one_transaction(session):
    u, *_ , wallet, fp = await _setup(session)
    with pytest.raises(ledger.UnbalancedTransaction):
        await ledger.transfer(session, idempotency_key="bad", kind="x",
                              src=fp.id, dst=wallet.id, amount_micros=1)


@pytest.mark.asyncio
async def test_fp_win_pays_winnings_only_in_cash(session):
    u, ev, sh, sa, wallet, fp = await _setup(session)
    bet = await place_bet(session, user_id=u.id, legs=[{"selection_id": sh.id}],
                          stake_micros=to_micros("50"), accept_changes=True,
                          idempotency_key="k", free_play=True)
    # the cash wallet never moved at placement
    assert await ledger.balance_of(session, wallet.id) == 0
    assert await ledger.balance_of(session, fp.id) == 0        # FP staked

    await grade_event(session, ev, 2, 0)                       # home wins at 2.50
    await settle_bets(session)
    # winnings only: 50 * 2.5 - 50 = 75 cash; the FP itself is consumed
    assert await ledger.balance_of(session, wallet.id) == to_micros("75")
    assert await ledger.balance_of(session, fp.id) == 0
    assert bet.status == "won" and bet.payout_micros == to_micros("75")


@pytest.mark.asyncio
async def test_fp_loss_costs_the_player_no_cash(session):
    u, ev, sh, sa, wallet, fp = await _setup(session)
    await place_bet(session, user_id=u.id, legs=[{"selection_id": sh.id}],
                    stake_micros=to_micros("50"), accept_changes=True,
                    idempotency_key="k", free_play=True)
    await grade_event(session, ev, 0, 2)                       # home loses
    await settle_bets(session)
    assert await ledger.balance_of(session, wallet.id) == 0    # no cash lost
    assert await ledger.balance_of(session, fp.id) == 0        # FP gone


@pytest.mark.asyncio
async def test_fp_push_returns_the_free_play(session):
    u, ev, sh, sa, wallet, fp = await _setup(session)
    bet = await place_bet(session, user_id=u.id, legs=[{"selection_id": sh.id}],
                          stake_micros=to_micros("50"), accept_changes=True,
                          idempotency_key="k", free_play=True)
    await grade_event(session, ev, 1, 1)          # 2-way market, tie -> void
    await settle_bets(session)
    assert bet.status == "void"
    assert await ledger.balance_of(session, wallet.id) == 0
    assert await ledger.balance_of(session, fp.id) == to_micros("50")


@pytest.mark.asyncio
async def test_fp_cannot_exceed_the_issued_amount_and_skips_exotics(session):
    u, ev, sh, sa, wallet, fp = await _setup(session)
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id, legs=[{"selection_id": sh.id}],
                        stake_micros=to_micros("51"), accept_changes=True,
                        idempotency_key="k1", free_play=True)
    assert e.value.reason == "insufficient_free_play"
    with pytest.raises(BetRejected) as e:
        await place_bet(session, user_id=u.id,
                        legs=[{"selection_id": sh.id}, {"selection_id": sa.id}],
                        stake_micros=to_micros("10"), accept_changes=True,
                        idempotency_key="k2", free_play=True, bet_type="if_win")
    assert e.value.reason == "free_play_straights_only"
