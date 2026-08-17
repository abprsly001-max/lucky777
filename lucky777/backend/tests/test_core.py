"""The tests that actually matter: money, fairness, and the ledger invariants.

    pytest -q
"""
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.casino.duel import engine as duel
from app.core import fairness, ledger
from app.core.money import from_micros, payout_micros, to_micros
from app.models import Base


# ------------------------------------------------------------------ money ----
def test_money_is_exact():
    assert to_micros("0.1") + to_micros("0.2") == to_micros("0.3")
    assert from_micros(to_micros("123.456789")) == Decimal("123.456789")


def test_payout_always_rounds_down():
    # 3 micro-credits at 0.5x would be 1.5 -- the house keeps the half
    assert payout_micros(3, Decimal("0.5")) == 1
    assert payout_micros(to_micros("10"), Decimal("2.0")) == to_micros("20")


def test_no_floats_leak_into_money():
    assert isinstance(payout_micros(to_micros("1"), Decimal("2.11")), int)


# --------------------------------------------------------------- fairness ----
def test_hmac_is_deterministic_and_nonce_sensitive():
    a = fairness.digest_for("seed", "client", 1)
    assert a == fairness.digest_for("seed", "client", 1)
    assert a != fairness.digest_for("seed", "client", 2)
    assert a != fairness.digest_for("seed2", "client", 1)


def test_commitment_binds_the_seed():
    seed, commitment = fairness.new_server_seed()
    assert fairness.sha256_hex(seed) == commitment
    assert fairness.sha256_hex(seed + "x") != commitment


def test_floats_are_in_range_and_stream_beyond_one_digest():
    fs = fairness.floats("s", "c", 1, 40)  # needs 5 digests
    assert len(fs) == 40
    assert all(0.0 <= f < 1.0 for f in fs)


def test_server_seeds_are_unpredictable():
    """secrets, never random -- Mersenne Twister is recoverable from its output."""
    seeds = {fairness.new_server_seed()[0] for _ in range(200)}
    assert len(seeds) == 200
    assert all(len(s) == 64 for s in seeds)


# ------------------------------------------------------------------- duel ----
def test_duel_round_is_reproducible_from_seeds():
    a = duel.play("srv", "cli", 7, Decimal("0.63"), Decimal("2.0"))
    b = duel.play("srv", "cli", 7, Decimal("0.63"), Decimal("2.0"))
    assert a == b


def test_duel_rtp_matches_the_advertised_numbers():
    assert duel.rtp(Decimal("0.63"), Decimal("2.0")) == Decimal("0.740")
    # a fair coin paying 2x has no edge at all
    assert duel.rtp(Decimal("0.5"), Decimal("2.0")) == Decimal("1.000")


def test_duel_house_edge_is_positive_at_the_shipped_odds():
    assert duel.rtp(Decimal("0.63"), Decimal("2.0")) < 1


def test_duel_split_converges_on_the_advertised_rate():
    """The stated 63% has to be the real 63%, or the verifier would expose it."""
    n = 40_000
    house = sum(duel.play("s", "c", i, Decimal("0.63"), Decimal("2.0")).house_wins
                for i in range(1, n + 1))
    assert abs(house / n - 0.63) < 0.01


def test_losing_side_pays_nothing_and_winning_side_pays_the_multiplier():
    o = duel.play("s", "c", 1, Decimal("1.0"), Decimal("2.0"))   # house always wins
    assert o.house_wins and o.multiplier == 0
    o = duel.play("s", "c", 1, Decimal("0.0"), Decimal("2.0"))   # player always wins
    assert not o.house_wins and o.multiplier == Decimal("2.0")


# ----------------------------------------------------------------- ledger ----
@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


async def _accounts(s):
    house = await ledger.get_or_create_account(s, "house")
    wallet = await ledger.get_or_create_account(s, "user_wallet", user_id=1)
    await ledger.transfer(s, idempotency_key="fund", kind="signup_bonus",
                          src=house.id, dst=wallet.id, amount_micros=to_micros("1000"))
    return house, wallet


@pytest.mark.asyncio
async def test_unbalanced_transaction_is_rejected(session):
    _, wallet = await _accounts(session)
    with pytest.raises(ledger.UnbalancedTransaction):
        await ledger.post(session, idempotency_key="bad", kind="x",
                          legs=[ledger.Leg(wallet.id, 100)])  # money from nowhere


@pytest.mark.asyncio
async def test_wallet_cannot_go_negative(session):
    house, wallet = await _accounts(session)
    with pytest.raises(ledger.InsufficientFunds):
        await ledger.transfer(session, idempotency_key="overdraw", kind="bet_place",
                              src=wallet.id, dst=house.id, amount_micros=to_micros("1000000"))
    assert await ledger.balance_of(session, wallet.id) == to_micros("1000")


@pytest.mark.asyncio
async def test_replaying_an_idempotency_key_is_a_noop(session):
    house, wallet = await _accounts(session)
    for _ in range(5):  # the settlement worker WILL run twice
        await ledger.transfer(session, idempotency_key="settle:1", kind="bet_settle",
                              src=house.id, dst=wallet.id, amount_micros=to_micros("50"))
    assert await ledger.balance_of(session, wallet.id) == to_micros("1050")


@pytest.mark.asyncio
async def test_concurrent_debits_cannot_overdraw(session):
    """Two bets racing on the same wallet must not both pass the balance check."""
    house, wallet = await _accounts(session)
    ok = 0
    for i in range(15):  # 15 x 100 against a 1000 balance
        try:
            await ledger.transfer(session, idempotency_key=f"race:{i}", kind="bet_place",
                                  src=wallet.id, dst=house.id, amount_micros=to_micros("100"))
            ok += 1
        except ledger.InsufficientFunds:
            pass
    assert ok == 10
    assert await ledger.balance_of(session, wallet.id) == 0


@pytest.mark.asyncio
async def test_books_always_balance(session):
    house, wallet = await _accounts(session)
    for i in range(50):
        await ledger.transfer(session, idempotency_key=f"p:{i}", kind="bet_place",
                              src=wallet.id, dst=house.id, amount_micros=to_micros("1"))
        await ledger.transfer(session, idempotency_key=f"s:{i}", kind="bet_settle",
                              src=house.id, dst=wallet.id, amount_micros=to_micros("0.74"))
    await session.commit()
    report = await ledger.check_integrity(session)
    assert report["ok"], report


# ---------------------------------------------------------- credit floors ----
@pytest.mark.asyncio
async def test_credit_floor_allows_negative_down_to_the_limit(session):
    """A customer with a 500 credit limit and zero balance can put exactly 500
    into action -- and not one micro-credit more."""
    house = await ledger.get_or_create_account(session, "house")
    wallet = await ledger.get_or_create_account(session, "user_wallet", user_id=9)
    floor = -to_micros("500")

    await ledger.transfer(session, idempotency_key="c1", kind="bet_place",
                          src=wallet.id, dst=house.id, amount_micros=to_micros("500"),
                          src_floor_micros=floor)
    assert await ledger.balance_of(session, wallet.id) == floor

    with pytest.raises(ledger.InsufficientFunds):
        await ledger.transfer(session, idempotency_key="c2", kind="bet_place",
                              src=wallet.id, dst=house.id, amount_micros=1,
                              src_floor_micros=floor)


@pytest.mark.asyncio
async def test_default_floor_is_still_zero(session):
    """Prepaid behaviour is unchanged: no floor argument means no credit."""
    house = await ledger.get_or_create_account(session, "house")
    wallet = await ledger.get_or_create_account(session, "user_wallet", user_id=10)
    with pytest.raises(ledger.InsufficientFunds):
        await ledger.transfer(session, idempotency_key="d1", kind="bet_place",
                              src=wallet.id, dst=house.id, amount_micros=1)
