"""Seed-pair lifecycle: exactly one active pair per user, monotonic nonce."""
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import SeedPair
from .fairness import new_client_seed, new_server_seed


async def active_pair(session: AsyncSession, user_id: int) -> SeedPair:
    q = select(SeedPair).where(SeedPair.user_id == user_id, SeedPair.revealed_at.is_(None))
    pair = (await session.execute(q)).scalar_one_or_none()
    if pair:
        return pair
    seed, seed_hash = new_server_seed()
    pair = SeedPair(user_id=user_id, server_seed=seed, server_seed_hash=seed_hash,
                    client_seed=new_client_seed(), nonce=0)
    session.add(pair)
    await session.flush()
    return pair


async def consume_nonce(session: AsyncSession, pair: SeedPair) -> int:
    """Atomically claim the next nonce.

    A duplicated nonce means a duplicated outcome, which is a *verifiable*
    fairness failure -- so this is a conditional update, never a read-then-write.
    """
    for _ in range(5):
        current = pair.nonce
        res = await session.execute(
            update(SeedPair)
            .where(SeedPair.id == pair.id, SeedPair.nonce == current)
            .values(nonce=current + 1)
        )
        if res.rowcount == 1:
            pair.nonce = current + 1
            return current + 1
        await session.refresh(pair)
    raise RuntimeError("could not claim a nonce")


async def rotate(session: AsyncSession, user_id: int, new_client: str | None = None) -> tuple[SeedPair, SeedPair]:
    """Reveal the old server seed and issue a fresh pair. Returns (revealed, new)."""
    old = await active_pair(session, user_id)
    old.revealed_at = datetime.now(timezone.utc)
    await session.flush()

    seed, seed_hash = new_server_seed()
    new = SeedPair(
        user_id=user_id, server_seed=seed, server_seed_hash=seed_hash,
        client_seed=(new_client or new_client_seed())[:64], nonce=0,
    )
    session.add(new)
    await session.flush()
    return old, new
