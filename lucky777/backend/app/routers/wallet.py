from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import ledger
from ..core.money import from_micros
from ..core.security import current_user
from ..db import get_session
from ..models import LedgerEntry, LedgerTransaction, User

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@router.get("/balance")
async def balance(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    wallet = await ledger.wallet_for(session, user.id)
    bal = await ledger.balance_of(session, wallet.id)
    fp_wallet = await ledger.fp_wallet_for(session, user.id)
    fp = await ledger.balance_of(session, fp_wallet.id)
    await session.commit()
    return {"balance": str(from_micros(bal)), "free_play": str(from_micros(fp))}


@router.get("/ledger")
async def entries(limit: int = 50, user: User = Depends(current_user),
                  session: AsyncSession = Depends(get_session)):
    wallet = await ledger.wallet_for(session, user.id)
    rows = (await session.execute(
        select(LedgerEntry, LedgerTransaction)
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .where(LedgerEntry.account_id == wallet.id)
        .order_by(desc(LedgerEntry.id)).limit(min(limit, 200))
    )).all()
    await session.commit()
    return [
        {"id": e.id, "amount": str(from_micros(e.amount_micros)), "kind": t.kind,
         "ref_type": t.ref_type, "ref_id": t.ref_id, "at": t.created_at.isoformat()}
        for e, t in rows
    ]


@router.get("/integrity")
async def integrity(session: AsyncSession = Depends(get_session)):
    """Public on purpose -- anyone can confirm the books balance."""
    return await ledger.check_integrity(session)
