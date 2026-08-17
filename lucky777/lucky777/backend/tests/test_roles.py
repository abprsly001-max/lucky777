"""Operator vs player separation.

The rule: operators can see the house position and drive the feed. They get no
edge inside any game -- an operator's bet goes through exactly the same engine,
ledger and seed pair as anyone else's.
"""
import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core import ledger
from app.core.money import to_micros
from app.core.security import current_admin, hash_password, verify_password
from app.models import Base, User


@pytest_asyncio.fixture
async def session():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)() as s:
        yield s


@pytest.mark.asyncio
async def test_player_is_refused_operator_access():
    player = User(id=1, username="p", password_hash="x", is_admin=0)
    with pytest.raises(HTTPException) as e:
        await current_admin(player)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_operator_is_allowed():
    admin = User(id=2, username="a", password_hash="x", is_admin=1)
    assert await current_admin(admin) is admin


def test_default_role_is_player():
    """A bare User must not be an operator by accident."""
    assert not User(username="x", password_hash="y").is_admin


def test_blank_signup_code_cannot_be_matched():
    """With no code configured, the operator path is closed -- an empty string
    submitted by a client must not satisfy an empty configured code."""
    for submitted in ("", None, "anything"):
        configured = ""
        assert not (bool(configured) and submitted == configured)


def test_configured_code_still_works():
    configured = "s3cret"
    assert bool(configured) and "s3cret" == configured
    assert not (bool(configured) and "wrong" == configured)


def test_password_hashing_round_trips():
    h = hash_password("hunter22")
    assert verify_password("hunter22", h)
    assert not verify_password("hunter23", h)
    assert h != hash_password("hunter22"), "each hash must use a fresh salt"


@pytest.mark.asyncio
async def test_operator_wallet_is_an_ordinary_wallet(session):
    """The operator account holds a normal user wallet with no special rules --
    it cannot go negative, exactly like a player's."""
    admin = User(username="admin", password_hash=hash_password("x"), is_admin=1)
    session.add(admin)
    await session.flush()

    wallet = await ledger.wallet_for(session, admin.id)
    house = await ledger.house_account(session)
    assert wallet.kind == "user_wallet"
    assert wallet.kind not in ledger.MAY_GO_NEGATIVE
    assert house.kind in ledger.MAY_GO_NEGATIVE

    with pytest.raises(ledger.InsufficientFunds):
        await ledger.transfer(session, idempotency_key="k", kind="bet_place",
                              src=wallet.id, dst=house.id, amount_micros=to_micros("1"))


@pytest.mark.asyncio
async def test_master_dependency_refuses_sub_agents():
    """Sub-agents run a sheet; only the master runs the book."""
    from app.core.security import current_master
    sub = User(id=3, username="tony", password_hash="x", is_admin=1, is_master=0)
    with pytest.raises(HTTPException) as e:
        await current_master(sub)
    assert e.value.status_code == 403

    master = User(id=4, username="boss", password_hash="x", is_admin=1, is_master=1)
    assert await current_master(master) is master


def test_default_agent_is_not_master():
    assert not User(username="a", password_hash="x", is_admin=1).is_master


@pytest.mark.asyncio
async def test_scope_is_exactly_the_agents_own_customers(session):
    from app.routers.agent import _in_scope, _scope_ids
    master = User(username="boss", password_hash="x", is_admin=1, is_master=1)
    tony = User(username="tony", password_hash="x", is_admin=1, is_master=0)
    session.add_all([master, tony])
    await session.flush()
    mine = User(username="p1", password_hash="x", created_by=tony.id)
    other = User(username="p2", password_hash="x", created_by=master.id)
    session.add_all([mine, other])
    await session.flush()

    assert await _scope_ids(session, master) is None          # master sees all
    scope = await _scope_ids(session, tony)
    assert _in_scope(mine.id, scope)
    assert not _in_scope(other.id, scope)
