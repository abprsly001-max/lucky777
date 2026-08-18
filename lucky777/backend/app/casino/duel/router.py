import secrets
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...core import ledger, seeds
from ...core.money import from_micros, payout_micros, to_micros
from ...core.security import betting_user, current_user
from ...db import get_session
from ...models import DuelRound, SeedPair, User
from . import engine

router = APIRouter(prefix="/api/casino/duel", tags=["duel"])


def _odds() -> tuple[Decimal, Decimal]:
    return Decimal(settings.duel_house_win_prob), Decimal(settings.duel_payout_multiplier)


class DuelRequest(BaseModel):
    stake: str
    idempotency_key: str | None = None


class DuelResponse(BaseModel):
    round_id: int
    nonce: int
    roll: str
    threshold: str
    house_wins: bool
    stake: str
    payout: str
    profit: str
    balance: str
    server_seed_hash: str
    client_seed: str


@router.get("/rules")
async def rules():
    """The whole game, stated up front. Nothing about the odds is hidden and
    nothing about them is inferred -- these are the exact numbers the engine
    uses, read from the same config the bets run on."""
    hp, pm = _odds()
    r = engine.rtp(hp, pm)
    return {
        "house_win_probability": str(hp),
        "player_win_probability": str(Decimal(1) - hp),
        "payout_multiplier": str(pm),
        "rtp": str(r),
        "house_edge_pct": str(round((Decimal(1) - r) * 100, 3)),
        "rule": f"a uniform roll in [0,1) is drawn from the seed pair; "
                f"the house takes the round when roll < {hp}",
        "summary": f"The house wins {hp * 100:.0f}% of rounds. You win "
                   f"{(Decimal(1) - hp) * 100:.0f}% and are paid {pm}x your stake.",
    }


@router.post("/bet", response_model=DuelResponse)
async def place(req: DuelRequest, user: User = Depends(betting_user),
                session: AsyncSession = Depends(get_session)):
    try:
        stake = Decimal(req.stake)
    except InvalidOperation:
        raise HTTPException(400, "stake is not a number")
    if not user.allow_casino and not user.is_admin:
        raise HTTPException(403, "casino is switched off for your account - ask your agent")
    if stake < Decimal(settings.min_bet_credits):
        raise HTTPException(400, f"minimum stake is {settings.min_bet_credits}")
    cap = (from_micros(user.wager_limit_micros) if user.wager_limit_micros
           else Decimal(settings.max_bet_credits))
    if stake > cap:
        raise HTTPException(400, f"your limit on a single wager is {cap}")
    stake_micros = to_micros(stake)
    house_prob, payout_mult = _odds()

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)

    outcome = engine.play(pair.server_seed, pair.client_seed, nonce, house_prob, payout_mult)
    payout = payout_micros(stake_micros, outcome.multiplier)

    rnd = DuelRound(
        user_id=user.id, seed_pair_id=pair.id, nonce=nonce, stake_micros=stake_micros,
        roll=str(outcome.roll), house_win_prob=str(house_prob),
        payout_multiplier=str(payout_mult), house_wins=int(outcome.house_wins),
        payout_micros=payout,
    )
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    try:
        await ledger.transfer(
            session, idempotency_key=f"duel:{rnd.id}:place:{key}", kind="bet_place",
            src=wallet.id, dst=house.id, amount_micros=stake_micros,
            ref_type="duel_round", ref_id=rnd.id,
            src_floor_micros=-(user.credit_limit_micros or 0),
        )
    except ledger.InsufficientFunds:
        await session.rollback()
        raise HTTPException(402, "insufficient balance")

    if payout > 0:
        await ledger.transfer(
            session, idempotency_key=f"duel:{rnd.id}:settle:{key}", kind="bet_settle",
            src=house.id, dst=wallet.id, amount_micros=payout,
            ref_type="duel_round", ref_id=rnd.id,
        )

    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()

    return DuelResponse(
        round_id=rnd.id, nonce=nonce, roll=str(outcome.roll), threshold=str(outcome.threshold),
        house_wins=outcome.house_wins, stake=str(from_micros(stake_micros)),
        payout=str(from_micros(payout)), profit=str(from_micros(payout - stake_micros)),
        balance=str(from_micros(balance)),
        server_seed_hash=pair.server_seed_hash, client_seed=pair.client_seed,
    )


@router.get("/history")
async def history(limit: int = 30, user: User = Depends(current_user),
                  session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(DuelRound, SeedPair.revealed_at, SeedPair.server_seed)
        .join(SeedPair, SeedPair.id == DuelRound.seed_pair_id)
        .where(DuelRound.user_id == user.id)
        .order_by(desc(DuelRound.id)).limit(min(limit, 200))
    )).all()
    await session.commit()
    return [
        {"round_id": r.id, "nonce": r.nonce, "roll": r.roll,
         "house_win_prob": r.house_win_prob, "payout_multiplier": r.payout_multiplier,
         "house_wins": bool(r.house_wins), "stake": str(from_micros(r.stake_micros)),
         "payout": str(from_micros(r.payout_micros)),
         "profit": str(from_micros(r.payout_micros - r.stake_micros)),
         "created_at": r.created_at.isoformat(),
         "server_seed": ss if revealed else None}
        for r, revealed, ss in rows
    ]
