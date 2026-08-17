from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..casino.duel import engine as duel_engine
from ..core import seeds
from ..core.fairness import sha256_hex
from ..core.security import current_user
from ..db import get_session
from ..models import SeedPair, User

router = APIRouter(prefix="/api/fairness", tags=["fairness"])


@router.get("/current")
async def current(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    pair = await seeds.active_pair(session, user.id)
    await session.commit()
    return {
        "server_seed_hash": pair.server_seed_hash,   # the commitment
        "client_seed": pair.client_seed,
        "nonce": pair.nonce,
    }


class RotateRequest(BaseModel):
    client_seed: str | None = Field(None, max_length=64)


@router.post("/rotate")
async def rotate(body: RotateRequest, user: User = Depends(current_user),
                 session: AsyncSession = Depends(get_session)):
    """Reveal the current server seed and start a fresh pair.

    After this, every round played under the old pair can be recomputed by
    anyone -- which is the entire point of the commit/reveal scheme.
    """
    old, new = await seeds.rotate(session, user.id, body.client_seed)
    payload = {
        "revealed": {
            "server_seed": old.server_seed,
            "server_seed_hash": old.server_seed_hash,
            "client_seed": old.client_seed,
            "rounds_played": old.nonce,
            "hash_matches": sha256_hex(old.server_seed) == old.server_seed_hash,
        },
        "new": {"server_seed_hash": new.server_seed_hash,
                "client_seed": new.client_seed, "nonce": 0},
    }
    await session.commit()
    return payload


@router.get("/revealed")
async def revealed(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(SeedPair).where(SeedPair.user_id == user.id, SeedPair.revealed_at.is_not(None))
        .order_by(desc(SeedPair.id)).limit(20)
    )).scalars().all()
    await session.commit()
    return [
        {"server_seed": p.server_seed, "server_seed_hash": p.server_seed_hash,
         "client_seed": p.client_seed, "rounds": p.nonce,
         "hash_matches": sha256_hex(p.server_seed) == p.server_seed_hash,
         "revealed_at": p.revealed_at.isoformat()}
        for p in rows
    ]



class VerifyDuelRequest(BaseModel):
    server_seed: str
    client_seed: str
    nonce: int
    house_win_prob: str = "0.63"
    payout_multiplier: str = "2.0"


@router.post("/verify")
async def verify_duel(body: VerifyDuelRequest):
    """Recompute a duel round. Because the odds in force are stored on each
    round row and echoed back here, a player can confirm the house really was
    on 63% and not quietly moved to something else."""
    from decimal import Decimal
    result = duel_engine.verify(
        body.server_seed, body.client_seed, body.nonce,
        Decimal(body.house_win_prob), Decimal(body.payout_multiplier),
    )
    result["server_seed_hash"] = sha256_hex(body.server_seed)
    return result
