"""The player's own view of their book: figures, balance, the week.

Everything is the customer's OWN slice of exactly what the agent console
computes -- same helpers, same ledger, same week clock -- so the number a
player sees is always the number their agent sees.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import ledger
from ..core.money import from_micros
from ..core.security import current_user, hash_password, verify_password
from ..db import get_session
from ..models import Account, LedgerEntry, LedgerTransaction, Settlement, User
from ..sportsbook.models import Competition, Event, Sport
from .agent import EPOCH, _graded_figure, week_start

router = APIRouter(prefix="/api/me", tags=["player"])


# what each ledger movement reads as on the player's statement
_KIND_LABEL = {
    "adjustment": ("Deposit", "Withdrawal"),
    "bet_place": ("Wager", "Wager"),
    "bet_settle": ("Payout", "Payout"),
    "bet_void": ("Wager refund", "Wager refund"),
    "settlement": ("Settled up", "Settled up"),
    "account_open": ("Account opened", "Account opened"),
    "freeplay_issue": ("Free play issued", "Free play removed"),
    "freeplay_stake": ("Free play wager", "Free play wager"),
    "freeplay_refund": ("Free play returned", "Free play returned"),
    "signup_bonus": ("Opening credit", "Opening credit"),
}


@router.get("/transactions")
async def my_transactions(weeks_back: int = 0, user: User = Depends(current_user),
                          session: AsyncSession = Depends(get_session)):
    """The player's cash statement for one betting week: a Balance Forward
    opening line, then every movement with a running balance. Free-play
    movements are their own currency and don't touch this balance; they show
    on the figures page instead."""
    weeks_back = max(0, min(weeks_back, 13))
    start = week_start() - timedelta(weeks=weeks_back)
    end = start + timedelta(days=7)
    wallet = await ledger.wallet_for(session, user.id)

    forward = (await session.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0))
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .where(LedgerEntry.account_id == wallet.id,
               LedgerTransaction.created_at < start))).scalar() or 0

    rows = (await session.execute(
        select(LedgerEntry, LedgerTransaction)
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .where(LedgerEntry.account_id == wallet.id,
               LedgerTransaction.created_at >= start,
               LedgerTransaction.created_at < end)
        .order_by(LedgerEntry.id)
    )).all()
    await session.commit()

    out = []
    balance = forward
    for e, t in rows:
        balance += e.amount_micros
        i = 0 if e.amount_micros >= 0 else 1
        out.append({
            "id": e.id, "at": t.created_at.isoformat(),
            "description": _KIND_LABEL.get(t.kind, (t.kind, t.kind))[i],
            "amount": str(from_micros(e.amount_micros)),
            "balance": str(from_micros(balance)),
        })
    return {
        "week_start": start.isoformat(), "weeks_back": weeks_back,
        "balance_forward": str(from_micros(forward)),
        "rows": out,
    }


@router.get("/scores")
async def my_scores(user: User = Depends(current_user),
                    session: AsyncSession = Depends(get_session)):
    """The scoreboard, player edition: live games first, then finals."""
    rows = (await session.execute(
        select(Event, Competition, Sport)
        .join(Competition, Competition.id == Event.competition_id)
        .join(Sport, Sport.id == Competition.sport_id)
        .order_by(Sport.name, Event.status.desc(), Event.starts_at)
    )).all()
    await session.commit()
    return [
        {"sport": s.name, "icon": s.icon, "league": c.name,
         "home": e.home, "away": e.away,
         "home_score": e.home_score, "away_score": e.away_score,
         "status": e.status, "period": e.period,
         "starts_at": e.starts_at.isoformat()}
        for e, c, s in rows
    ]


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/password")
async def change_my_password(body: ChangePassword, user: User = Depends(current_user),
                             session: AsyncSession = Depends(get_session)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "current password is wrong")
    user.password_hash = hash_password(body.new_password)
    await session.commit()
    return {"ok": True}


@router.get("/figures")
async def my_figures(weeks_back: int = 0, user: User = Depends(current_user),
                     session: AsyncSession = Depends(get_session)):
    weeks_back = max(0, min(weeks_back, 12))
    start = week_start() - timedelta(weeks=weeks_back)
    end = start + timedelta(days=7)
    wallet = await ledger.wallet_for(session, user.id)

    days = []
    labels = []
    for i in range(7):
        d0 = start + timedelta(days=i)
        f = await _graded_figure(session, wallet.id, user.id, d0, d0 + timedelta(days=1))
        days.append(str(from_micros(f["figure_micros"])))
        labels.append(d0.strftime("%a %m/%d"))

    wf = await _graded_figure(session, wallet.id, user.id, start, end)

    prior = await _graded_figure(session, wallet.id, user.id, EPOCH, start)
    settled_before = (await session.execute(
        select(func.coalesce(func.sum(Settlement.figure_micros), 0))
        .where(Settlement.user_id == user.id,
               Settlement.week_start < start))).scalar() or 0
    carry = prior["figure_micros"] - settled_before

    settled = (await session.execute(
        select(Settlement).where(Settlement.user_id == user.id,
                                 Settlement.week_start == start))).scalar_one_or_none()

    # the Transactions line: deposits/withdrawals the agent keyed in this week
    adj = (await session.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0))
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .where(LedgerEntry.account_id == wallet.id,
               LedgerTransaction.kind.in_(("adjustment", "account_open")),
               LedgerTransaction.created_at >= start,
               LedgerTransaction.created_at < end))).scalar() or 0

    balance = await ledger.balance_of(session, wallet.id)
    fp_wallet = await ledger.fp_wallet_for(session, user.id)
    fp = await ledger.balance_of(session, fp_wallet.id)
    await session.commit()
    return {
        "week_start": start.isoformat(), "week_end": end.isoformat(),
        "weeks_back": weeks_back,
        "day_labels": labels, "days": days,
        "week": str(from_micros(wf["figure_micros"])),
        "pending": str(from_micros(wf["pending_micros"])),
        "wagers": wf["wagers"],
        "carry": str(from_micros(carry)),
        "adjustments": str(from_micros(adj)),
        "end_balance": str(from_micros(carry + wf["figure_micros"] + adj)),
        "balance": str(from_micros(balance)),
        "free_play": str(from_micros(fp)),
        "credit_limit": str(from_micros(user.credit_limit_micros or 0)),
        "available": str(from_micros(max(0, balance + (user.credit_limit_micros or 0)))),
        "settled_this_week": settled is not None,
        "note": "Figures close on the last night of the betting week; you square up "
                "with your agent on payout day. A positive figure means you're up.",
    }
