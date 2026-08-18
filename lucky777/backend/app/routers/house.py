"""The house account's position. Operator-only.

The staff account is the counterparty to every bet on the platform. This shows
what it is holding and the edge it has actually realised, next to the edge the
games advertise. If those two diverge beyond sampling noise, something is wrong.

Players cannot see this, but they can still audit the books themselves via the
public /api/wallet/integrity -- the operator view is a convenience, not the
only source of truth.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..casino.duel import engine as duel_engine
from ..config import settings
from ..core import ledger
from ..core.money import from_micros
from ..core.security import current_admin
from ..db import get_session
from ..models import User
from ..models import Account, DuelRound, LedgerEntry, LedgerTransaction
from ..sportsbook.models import Bet

router = APIRouter(prefix="/api/house", tags=["house"])


@router.get("/stats")
async def stats(_: User = Depends(current_admin),
                session: AsyncSession = Depends(get_session)):
    house = await ledger.house_account(session)

    async def flow(kind: str, ref_type: str | None = None) -> int:
        q = (select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0))
             .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
             .where(LedgerEntry.account_id == house.id, LedgerTransaction.kind == kind))
        if ref_type:
            q = q.where(LedgerTransaction.ref_type == ref_type)
        return (await session.execute(q)).scalar() or 0

    async def game_block(ref_type: str, model) -> dict:
        wagered = await flow("bet_place", ref_type)      # positive: into the house
        paid = -(await flow("bet_settle", ref_type))     # positive: out of the house
        rounds = (await session.execute(select(func.count()).select_from(model))).scalar() or 0
        realised = (Decimal(wagered - paid) / Decimal(wagered) * 100) if wagered else Decimal(0)
        return {
            "rounds": rounds,
            "wagered": str(from_micros(wagered)),
            "paid_out": str(from_micros(paid)),
            "house_profit": str(from_micros(wagered - paid)),
            "realised_edge_pct": str(round(realised, 3)),
        }

    hp, pm = Decimal(settings.duel_house_win_prob), Decimal(settings.duel_payout_multiplier)
    duel_stats = await game_block("duel_round", DuelRound)
    duel_house_won = (await session.execute(
        select(func.count()).select_from(DuelRound).where(DuelRound.house_wins == 1))).scalar() or 0
    duel_stats["house_win_rate_pct"] = (
        str(round(Decimal(duel_house_won) / Decimal(duel_stats["rounds"]) * 100, 2))
        if duel_stats["rounds"] else "0"
    )
    duel_stats["advertised_house_win_pct"] = str(hp * 100)
    duel_stats["advertised_edge_pct"] = str(round((Decimal(1) - duel_engine.rtp(hp, pm)) * 100, 3))


    sb_stats = await game_block("sports_bet", Bet)
    sb_stats["advertised_edge_pct"] = "~5.7 per leg"
    sb_stats["open_liability"] = str(from_micros((await session.execute(
        select(func.coalesce(func.sum(Bet.potential_micros), 0))
        .where(Bet.status == "open"))).scalar() or 0))

    players = (await session.execute(
        select(func.count()).select_from(Account).where(Account.kind == "user_wallet"))).scalar() or 0

    await session.commit()
    return {
        "house_balance": str(from_micros(await ledger.balance_of(session, house.id))),
        "players": players,
        "duel": duel_stats,
        "sportsbook": sb_stats,
        "note": "The house account is the counterparty to every bet. A negative "
                "balance simply means players are up on it right now.",
    }
