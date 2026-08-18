"""Agent console: the operator's back-office.

Everything here is derived from the ledger rather than stored alongside it, so
a figure can never drift from what actually happened. The week starts on the
book's payout day (config week_start_day, default Tuesday) at 00:00 UTC and
runs seven days -- pay Tuesday, and figures close Monday night.
"""
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..core import ledger, seeds
from ..core.money import from_micros, to_micros
from ..core.security import current_admin, current_master, hash_password
from ..db import get_session
from ..models import (
    Account, BookLimits, DuelRound, LedgerEntry, LedgerTransaction, Settlement, User,
)
from ..sportsbook.placement import get_book_limits
from ..sportsbook.models import (
    Bet, BetSelection, Competition, Event, Market, Selection, Sport,
)

router = APIRouter(prefix="/api/agent", tags=["agent"])

# money movements that count toward a customer's win/loss figure.
# A faucet or a settlement is not action -- it must never inflate the figure.
# bet_void belongs here: the stake left as bet_place, so if the refund did not
# count too, every voided ticket would read as a straight loss on the figure
ACTION_KINDS = ("bet_place", "bet_settle", "bet_void")


EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)

_WEEKDAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
             "friday": 4, "saturday": 5, "sunday": 6}


def week_start(when: datetime | None = None) -> datetime:
    """00:00 UTC of the current betting week's first day.

    The week starts on the book's payout day (config week_start_day, default
    Tuesday): pay Tuesday, and the sheet runs Tuesday through Monday night.
    """
    start_dow = _WEEKDAYS.get(settings.week_start_day.strip().lower(), 1)
    now = when or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    back = (now.weekday() - start_dow) % 7
    d = now - timedelta(days=back)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


async def _pending_stake(session: AsyncSession, user_id: int | None,
                         since: datetime, until: datetime | None = None) -> int:
    """Stake sitting on wagers that haven't been graded yet.

    The stake leaves the wallet at placement, so a still-running wager looks
    exactly like a loss to a naive ledger sum. A figure must only count graded
    action, so this gets added back.
    """
    # free-play stakes never left the cash wallet, so they don't get added back
    q = (select(func.coalesce(func.sum(Bet.stake_micros), 0))
         .where(Bet.status == "open", Bet.is_free_play == 0, Bet.placed_at >= since))
    if user_id is not None:
        q = q.where(Bet.user_id == user_id)
    if until:
        q = q.where(Bet.placed_at < until)
    total = int((await session.execute(q)).scalar() or 0)

    # open racebook tickets are pending action too
    from ..racebook.models import RaceBet
    rq = (select(func.coalesce(func.sum(RaceBet.stake_micros), 0))
          .where(RaceBet.status == "open", RaceBet.placed_at >= since))
    if user_id is not None:
        rq = rq.where(RaceBet.user_id == user_id)
    if until:
        rq = rq.where(RaceBet.placed_at < until)
    return total + int((await session.execute(rq)).scalar() or 0)


async def _figure(session: AsyncSession, account_id: int,
                  since: datetime, until: datetime | None = None,
                  ref_types: tuple[str, ...] | None = None) -> dict:
    """Net action across a window. Positive figure = the customer is up.

    ref_types narrows to one product: ("sports_bet",) or ("duel_round",).
    """
    q = (select(
            func.coalesce(func.sum(LedgerEntry.amount_micros), 0),
            func.count(LedgerEntry.id))
         .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
         .where(LedgerEntry.account_id == account_id,
                LedgerTransaction.kind.in_(ACTION_KINDS),
                LedgerTransaction.created_at >= since))
    if until:
        q = q.where(LedgerTransaction.created_at < until)
    if ref_types:
        q = q.where(LedgerTransaction.ref_type.in_(ref_types))
    net, _ = (await session.execute(q)).one()

    # Volume is unsigned: it is how much got put into action, not a direction.
    # The same entry is negative on a wallet and positive on the house account,
    # so taking the raw sum here gives the house a negative "volume" and then a
    # positive-looking hold on a losing week. abs() is the whole fix.
    vol = abs((await session.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0))
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .where(LedgerEntry.account_id == account_id,
               LedgerTransaction.kind == "bet_place",
               LedgerTransaction.created_at >= since,
               *( [LedgerTransaction.created_at < until] if until else [] ),
               *( [LedgerTransaction.ref_type.in_(ref_types)] if ref_types else [] )))).scalar() or 0)

    wagers = (await session.execute(
        select(func.count()).select_from(LedgerTransaction)
        .join(LedgerEntry, LedgerEntry.transaction_id == LedgerTransaction.id)
        .where(LedgerEntry.account_id == account_id,
               LedgerTransaction.kind == "bet_place",
               LedgerTransaction.created_at >= since,
               *( [LedgerTransaction.created_at < until] if until else [] ),
               *( [LedgerTransaction.ref_type.in_(ref_types)] if ref_types else [] )))).scalar() or 0

    return {"figure_micros": int(net), "volume_micros": int(vol), "wagers": int(wagers)}


async def _graded_figure(session: AsyncSession, account_id: int, user_id: int | None,
                         since: datetime, until: datetime | None = None) -> dict:
    """A figure over graded action only, plus the pending stake shown separately."""
    f = await _figure(session, account_id, since, until)
    pending = await _pending_stake(session, user_id, since, until)
    sign = 1 if user_id is not None else -1   # the house sits on the other side
    return {
        **f,
        "figure_micros": f["figure_micros"] + sign * pending,
        "graded_volume_micros": f["volume_micros"] - pending,
        "pending_micros": pending,
    }


async def _scope_ids(session: AsyncSession, agent: User) -> list[int] | None:
    """Which customers this agent may see. None means all (the master).

    A sub-agent's sheet is exactly the customers they booked. Scoping lives in
    ONE place so a new report can't accidentally leak another agent's sheet.
    """
    if agent.is_master:
        return None
    ids = (await session.execute(
        select(User.id).where(User.is_admin == 0, User.created_by == agent.id)
    )).scalars().all()
    return list(ids)


def _in_scope(user_id: int, scope: list[int] | None) -> bool:
    return scope is None or user_id in scope


# ------------------------------------------------------------- customers ----
class NewCustomer(BaseModel):
    username: str = Field(..., min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    password: str | None = Field(None, min_length=6, max_length=128)
    # deposit is prepaid money; credit_limit is how deep they may run negative.
    # The classic book is deposit 0 / credit 500 -- they play on credit and
    # square up when the week settles.
    starting_credit: str = "0"
    credit_limit: str = "500"
    wager_limit: str | None = "500"


@router.post("/customers")
async def create_customer(body: NewCustomer, agent: User = Depends(current_admin),
                          session: AsyncSession = Depends(get_session)):
    """Book a new customer. There is no public signup -- the agent issues logins."""
    exists = (await session.execute(
        select(User).where(User.username == body.username))).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "username taken")

    password = body.password or secrets.token_urlsafe(9)
    try:
        start = to_micros(Decimal(body.starting_credit))
        credit = to_micros(Decimal(body.credit_limit))
        wager = to_micros(Decimal(body.wager_limit)) if body.wager_limit else None
    except InvalidOperation:
        raise HTTPException(400, "limits and starting credit must be numbers")

    user = User(username=body.username, password_hash=hash_password(password),
                is_admin=0, is_active=1, credit_limit_micros=credit,
                wager_limit_micros=wager, created_by=agent.id)
    session.add(user)
    await session.flush()

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await seeds.active_pair(session, user.id)
    if start > 0:
        await ledger.transfer(session, idempotency_key=f"open:{user.id}",
                              kind="account_open", src=house.id, dst=wallet.id,
                              amount_micros=start)
    await session.commit()
    return {
        "id": user.id, "username": user.username,
        # shown once; it is not recoverable afterwards, only resettable
        "password": password if body.password is None else None,
        "balance": str(from_micros(start)),
        "credit_limit": str(from_micros(credit)),
        "wager_limit": str(from_micros(wager)) if wager else None,
    }


@router.get("/customers")
async def list_customers(agent: User = Depends(current_admin),
                         session: AsyncSession = Depends(get_session)):
    since = week_start()
    scope = await _scope_ids(session, agent)
    q = select(User).where(User.is_admin == 0).order_by(User.username)
    if scope is not None:
        q = q.where(User.id.in_(scope))
    users = (await session.execute(q)).scalars().all()
    out = []
    for u in users:
        wallet = await ledger.wallet_for(session, u.id)
        fig = await _graded_figure(session, wallet.id, u.id, since)
        pending = (await session.execute(
            select(func.coalesce(func.sum(Bet.stake_micros), 0), func.count(Bet.id))
            .where(Bet.user_id == u.id, Bet.status == "open"))).one()
        balance = await ledger.balance_of(session, wallet.id)
        fp_wallet = await ledger.fp_wallet_for(session, u.id)
        fp_balance = await ledger.balance_of(session, fp_wallet.id)
        out.append({
            "id": u.id, "account": f"L77{u.id:04d}", "username": u.username,
            "display_name": u.display_name, "allow_live": bool(u.allow_live),
            "active": bool(u.is_active),
            "balance": str(from_micros(balance)),
            "free_play": str(from_micros(fp_balance)),
            "credit_limit": str(from_micros(u.credit_limit_micros or 0)),
            "wager_limit": (str(from_micros(u.wager_limit_micros))
                            if u.wager_limit_micros else None),
            # headroom left before the credit limit stops the next wager
            "available": str(from_micros(max(0, balance + (u.credit_limit_micros or 0)))),
            "allow_sportsbook": bool(u.allow_sportsbook),
            "allow_casino": bool(u.allow_casino),
            "week_figure": str(from_micros(fig["figure_micros"])),
            "week_volume": str(from_micros(fig["graded_volume_micros"])),
            "week_wagers": fig["wagers"],
            "pending_wagers": pending[1],
            "pending_risk": str(from_micros(pending[0])),
            "created_at": u.created_at.isoformat(),
        })
    await session.commit()
    return out


class AdjustRequest(BaseModel):
    amount: str          # positive = credit the customer, negative = debit
    note: str = ""


@router.post("/customers/{user_id}/adjust")
async def adjust_balance(user_id: int, body: AdjustRequest,
                         agent: User = Depends(current_admin),
                         session: AsyncSession = Depends(get_session)):
    """Credit or debit a customer directly.

    This replaces the old self-serve faucet: money now only moves when the
    agent moves it, and every adjustment lands in the ledger with the agent's
    id on it. Adjustments are excluded from ACTION_KINDS, so handing a customer
    more credit never distorts their win/loss figure.
    """
    user = await session.get(User, user_id)
    if user is None or user.is_admin:
        raise HTTPException(404, "no such customer")
    scope = await _scope_ids(session, agent)
    if not _in_scope(user.id, scope):
        raise HTTPException(403, "that customer is on another agent's sheet")
    try:
        amount = Decimal(body.amount)
    except InvalidOperation:
        raise HTTPException(400, "amount is not a number")
    if amount == 0:
        raise HTTPException(400, "amount cannot be zero")

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    micros = to_micros(abs(amount))
    key = f"adjust:{user.id}:{agent.id}:{secrets.token_hex(6)}"
    try:
        if amount > 0:
            await ledger.transfer(session, idempotency_key=key, kind="adjustment",
                                  src=house.id, dst=wallet.id, amount_micros=micros,
                                  ref_type="agent", ref_id=agent.id)
        else:
            # withdrawals may run the account down to its credit floor, same as
            # a wager can -- paying out a customer who is up is normal business
            await ledger.transfer(session, idempotency_key=key, kind="adjustment",
                                  src=wallet.id, dst=house.id, amount_micros=micros,
                                  ref_type="agent", ref_id=agent.id,
                                  src_floor_micros=-user.credit_limit_micros)
    except ledger.InsufficientFunds:
        raise HTTPException(409, "that debit would take the account past its credit limit")

    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"username": user.username, "adjusted": str(amount),
            "balance": str(from_micros(balance)), "note": body.note[:200]}


class FreePlayRequest(BaseModel):
    amount: str
    note: str = ""


@router.post("/customers/{user_id}/freeplay")
async def issue_free_play(user_id: int, body: FreePlayRequest,
                          agent: User = Depends(current_admin),
                          session: AsyncSession = Depends(get_session)):
    """Hand a customer free play (or claw unused free play back with a
    negative amount). FP rides on straights and parlays, pays winnings only,
    and never touches the cash figure until it wins.
    """
    user = await session.get(User, user_id)
    if user is None or user.is_admin:
        raise HTTPException(404, "no such customer")
    scope = await _scope_ids(session, agent)
    if not _in_scope(user.id, scope):
        raise HTTPException(403, "that customer is on another agent's sheet")
    try:
        amount = Decimal(body.amount)
    except InvalidOperation:
        raise HTTPException(400, "amount is not a number")
    if amount == 0:
        raise HTTPException(400, "amount cannot be zero")

    fp_wallet = await ledger.fp_wallet_for(session, user.id)
    fp_house = await ledger.fp_house_account(session)
    micros = to_micros(abs(amount))
    key = f"fp:{user.id}:{agent.id}:{secrets.token_hex(6)}"
    try:
        if amount > 0:
            await ledger.transfer(session, idempotency_key=key, kind="freeplay_issue",
                                  src=fp_house.id, dst=fp_wallet.id, amount_micros=micros,
                                  ref_type="agent", ref_id=agent.id)
        else:
            await ledger.transfer(session, idempotency_key=key, kind="freeplay_issue",
                                  src=fp_wallet.id, dst=fp_house.id, amount_micros=micros,
                                  ref_type="agent", ref_id=agent.id)
    except ledger.InsufficientFunds:
        raise HTTPException(409, "customer doesn't have that much unused free play")

    balance = await ledger.balance_of(session, fp_wallet.id)
    await session.commit()
    return {"username": user.username, "adjusted": str(amount),
            "free_play": str(from_micros(balance))}


class UpdateCustomer(BaseModel):
    active: bool | None = None
    credit_limit: str | None = None
    wager_limit: str | None = None      # "" clears back to the house default
    allow_sportsbook: bool | None = None
    allow_casino: bool | None = None
    allow_live: bool | None = None
    display_name: str | None = Field(None, max_length=64)
    notes: str | None = Field(None, max_length=500)
    agent_id: int | None = None         # master only: move to another sheet
    new_password: str | None = Field(None, min_length=6, max_length=128)


@router.patch("/customers/{user_id}")
async def update_customer(user_id: int, body: UpdateCustomer,
                          agent: User = Depends(current_admin),
                          session: AsyncSession = Depends(get_session)):
    user = await session.get(User, user_id)
    if user is None or user.is_admin:
        raise HTTPException(404, "no such customer")
    scope = await _scope_ids(session, agent)
    if not _in_scope(user.id, scope):
        raise HTTPException(403, "that customer is on another agent's sheet")
    if body.active is not None:
        user.is_active = int(body.active)
    if body.credit_limit is not None and body.credit_limit != "":
        user.credit_limit_micros = to_micros(Decimal(body.credit_limit))
    if body.wager_limit is not None:
        user.wager_limit_micros = (to_micros(Decimal(body.wager_limit))
                                   if body.wager_limit else None)
    if body.allow_sportsbook is not None:
        user.allow_sportsbook = int(body.allow_sportsbook)
    if body.allow_casino is not None:
        user.allow_casino = int(body.allow_casino)
    if body.allow_live is not None:
        user.allow_live = int(body.allow_live)
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    if body.notes is not None:
        user.notes = body.notes
    if body.agent_id is not None and body.agent_id != user.created_by:
        if not agent.is_master:
            raise HTTPException(403, "only the master moves players between sheets")
        target = await session.get(User, body.agent_id)
        if target is None or not target.is_admin:
            raise HTTPException(404, "no such agent")
        user.created_by = target.id
    if body.new_password:
        user.password_hash = hash_password(body.new_password)
    await session.commit()
    return {"id": user.id, "username": user.username, "active": bool(user.is_active)}


@router.get("/customers/{user_id}")
async def customer_profile(user_id: int, agent: User = Depends(current_admin),
                           session: AsyncSession = Depends(get_session)):
    """The player profile page behind a click on any account number."""
    user = await session.get(User, user_id)
    if user is None or user.is_admin:
        raise HTTPException(404, "no such customer")
    scope = await _scope_ids(session, agent)
    if not _in_scope(user.id, scope):
        raise HTTPException(403, "that customer is on another agent's sheet")

    wallet = await ledger.wallet_for(session, user.id)
    balance = await ledger.balance_of(session, wallet.id)
    fp_wallet = await ledger.fp_wallet_for(session, user.id)
    fp = await ledger.balance_of(session, fp_wallet.id)
    pending = (await session.execute(
        select(func.coalesce(func.sum(Bet.stake_micros), 0), func.count(Bet.id))
        .where(Bet.user_id == user.id, Bet.status == "open",
               Bet.is_free_play == 0))).one()
    fig = await _graded_figure(session, wallet.id, user.id, week_start())
    booked = await session.get(User, user.created_by) if user.created_by else None
    await session.commit()
    return {
        "id": user.id, "account": f"L77{user.id:04d}", "username": user.username,
        "display_name": user.display_name, "notes": user.notes,
        "active": bool(user.is_active),
        "agent_id": user.created_by, "agent": booked.username if booked else "—",
        "balance": str(from_micros(balance)),
        "free_play": str(from_micros(fp)),
        "pending_risk": str(from_micros(pending[0])), "pending_wagers": pending[1],
        "available": str(from_micros(max(0, balance + (user.credit_limit_micros or 0)))),
        "credit_limit": str(from_micros(user.credit_limit_micros or 0)),
        "wager_limit": (str(from_micros(user.wager_limit_micros))
                        if user.wager_limit_micros else ""),
        "allow_sportsbook": bool(user.allow_sportsbook),
        "allow_casino": bool(user.allow_casino),
        "allow_live": bool(user.allow_live),
        "week_figure": str(from_micros(fig["figure_micros"])),
        "created_at": user.created_at.isoformat(),
    }


# --------------------------------------------------------------- figures ----
@router.get("/figures/weekly")
async def weekly_figures(weeks_back: int = 0, agent: User = Depends(current_admin),
                         session: AsyncSession = Depends(get_session)):
    """The weekly sheet: per-day figures across the betting week, plus carry,
    deposits/withdrawals, balance and pending, per customer, with totals.

    Sign convention throughout: positive = the customer is up, negative = the
    customer owes. Pending wagers never count toward a day's figure -- a
    running ticket is not a loss.
    """
    start = week_start() - timedelta(weeks=weeks_back)
    end = start + timedelta(days=7)

    scope = await _scope_ids(session, agent)
    q = select(User).where(User.is_admin == 0).order_by(User.username)
    if scope is not None:
        q = q.where(User.id.in_(scope))
    users = (await session.execute(q)).scalars().all()

    day_labels = [(start + timedelta(days=i)).strftime("%a %m/%d") for i in range(7)]
    rows = []
    tot_days = [0] * 7
    tot = {"carry": 0, "week": 0, "adj": 0, "balance": 0, "pending": 0, "wagers": 0}

    for u in users:
        wallet = await ledger.wallet_for(session, u.id)

        days = []
        week_fig = 0
        wagers = 0
        for i in range(7):
            d0 = start + timedelta(days=i)
            f = await _graded_figure(session, wallet.id, u.id, d0, d0 + timedelta(days=1))
            days.append(f["figure_micros"])
            week_fig += f["figure_micros"]
            wagers += f["wagers"]

        wf = await _graded_figure(session, wallet.id, u.id, start, end)
        pending = wf["pending_micros"]

        # carry: net of all prior action minus figures already settled
        prior = await _graded_figure(session, wallet.id, u.id, EPOCH, start)
        settled_before = (await session.execute(
            select(func.coalesce(func.sum(Settlement.figure_micros), 0))
            .where(Settlement.user_id == u.id, Settlement.week_start < start))).scalar() or 0
        carry = prior["figure_micros"] - settled_before

        # +Dep/-Wd: money the agent moved this week (not action, not settle)
        adj = (await session.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0))
            .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
            .where(LedgerEntry.account_id == wallet.id,
                   LedgerTransaction.kind.in_(("adjustment", "account_open")),
                   LedgerTransaction.created_at >= start,
                   LedgerTransaction.created_at < end))).scalar() or 0

        balance = await ledger.balance_of(session, wallet.id)
        settled = (await session.execute(
            select(Settlement).where(Settlement.user_id == u.id,
                                     Settlement.week_start == start))).scalar_one_or_none()

        rows.append({
            "id": u.id,
            "account": f"L77{u.id:04d}",
            "username": u.username,
            "active": bool(u.is_active),
            "settled": settled is not None,
            "carry": str(from_micros(carry)),
            "days": [str(from_micros(d)) for d in days],
            "week": str(from_micros(week_fig)),
            "adjustments": str(from_micros(adj)),
            "balance": str(from_micros(balance)),
            "pending": str(from_micros(pending)),
            "wagers": wagers,
        })
        for i in range(7):
            tot_days[i] += days[i]
        tot["carry"] += carry; tot["week"] += week_fig; tot["adj"] += adj
        tot["balance"] += balance; tot["pending"] += pending; tot["wagers"] += wagers

    await session.commit()
    return {
        "week_start": start.isoformat(), "week_end": end.isoformat(),
        "weeks_back": weeks_back,
        "day_labels": day_labels,
        "customers": rows,
        "totals": {
            "players": len(rows),
            "carry": str(from_micros(tot["carry"])),
            "days": [str(from_micros(d)) for d in tot_days],
            "week": str(from_micros(tot["week"])),
            "adjustments": str(from_micros(tot["adj"])),
            "balance": str(from_micros(tot["balance"])),
            "pending": str(from_micros(tot["pending"])),
            "wagers": tot["wagers"],
            # the agent side of the sheet is the mirror image
            "book_week": str(from_micros(-tot["week"])),
        },
    }


class SettleRequest(BaseModel):
    user_id: int
    weeks_back: int = 0
    note: str = ""


@router.post("/figures/settle")
async def settle_figure(body: SettleRequest, agent: User = Depends(current_admin),
                        session: AsyncSession = Depends(get_session)):
    """Square up a customer's week and return them to their baseline.

    The cash changes hands outside the system; this records that it happened and
    posts the balancing ledger entry so the books still add to zero.
    """
    user = await session.get(User, body.user_id)
    if user is None or user.is_admin:
        raise HTTPException(404, "no such customer")
    scope = await _scope_ids(session, agent)
    if not _in_scope(user.id, scope):
        raise HTTPException(403, "that customer is on another agent's sheet")

    start = week_start() - timedelta(weeks=body.weeks_back)
    already = (await session.execute(
        select(Settlement).where(Settlement.user_id == user.id,
                                 Settlement.week_start == start))).scalar_one_or_none()
    if already:
        raise HTTPException(409, "that week is already settled")

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    fig = await _graded_figure(session, wallet.id, user.id, start, start + timedelta(days=7))

    balance = await ledger.balance_of(session, wallet.id)
    baseline = to_micros(Decimal(settings.customer_baseline_credits))
    delta = baseline - balance
    if delta > 0:
        await ledger.transfer(session, idempotency_key=f"settle:{user.id}:{start.date()}",
                              kind="settlement", src=house.id, dst=wallet.id,
                              amount_micros=delta)
    elif delta < 0:
        await ledger.transfer(session, idempotency_key=f"settle:{user.id}:{start.date()}",
                              kind="settlement", src=wallet.id, dst=house.id,
                              amount_micros=-delta)

    session.add(Settlement(user_id=user.id, settled_by=agent.id, week_start=start,
                           figure_micros=fig["figure_micros"], note=body.note[:200]))
    await session.commit()
    return {
        "username": user.username,
        "week_start": start.isoformat(),
        "figure": str(from_micros(fig["figure_micros"])),
        "balance_reset_to": str(from_micros(baseline)),
    }


_LIMIT_MONEY = ("min_straight", "max_straight", "max_per_offering", "max_per_event",
                "max_win_single", "max_win_event", "min_parlay", "max_parlay",
                "max_win_parlay")
_LIMIT_INTS = ("max_fav_line", "max_dog_line", "max_dog_line_parlay",
               "delay_sec", "cooloff_sec")
_LIMIT_FLAGS = ("live_parlays", "block_prior_start", "block_halftime",
                "include_graded", "use_risk")


def _limits_out(lim: BookLimits) -> dict:
    out = {k: str(from_micros(getattr(lim, f"{k}_micros"))) for k in _LIMIT_MONEY}
    out.update({k: getattr(lim, k) for k in _LIMIT_INTS})
    out.update({k: bool(getattr(lim, k)) for k in _LIMIT_FLAGS})
    return out


@router.get("/limits/book")
async def book_limits(agent: User = Depends(current_admin),
                      session: AsyncSession = Depends(get_session)):
    lim = await get_book_limits(session)
    out = _limits_out(lim)
    await session.commit()
    return out


class BookLimitsUpdate(BaseModel):
    # money fields arrive as credit strings, lines/seconds as ints, flags as bools
    min_straight: str | None = None
    max_straight: str | None = None
    max_per_offering: str | None = None
    max_per_event: str | None = None
    max_win_single: str | None = None
    max_win_event: str | None = None
    min_parlay: str | None = None
    max_parlay: str | None = None
    max_win_parlay: str | None = None
    max_fav_line: int | None = None
    max_dog_line: int | None = None
    max_dog_line_parlay: int | None = None
    delay_sec: int | None = None
    cooloff_sec: int | None = None
    live_parlays: bool | None = None
    block_prior_start: bool | None = None
    block_halftime: bool | None = None
    include_graded: bool | None = None
    use_risk: bool | None = None


@router.put("/limits/book")
async def update_book_limits(body: BookLimitsUpdate,
                             agent: User = Depends(current_master),
                             session: AsyncSession = Depends(get_session)):
    """Master only: these caps bind every wager the book writes from now on."""
    lim = await get_book_limits(session)
    for k in _LIMIT_MONEY:
        v = getattr(body, k)
        if v is not None:
            try:
                d = Decimal(v)
            except InvalidOperation:
                raise HTTPException(400, f"{k} is not a number")
            if d < 0:
                raise HTTPException(400, f"{k} cannot be negative")
            setattr(lim, f"{k}_micros", to_micros(d))
    for k in _LIMIT_INTS:
        v = getattr(body, k)
        if v is not None:
            if k == "max_fav_line" and v > 0:
                raise HTTPException(400, "max favorite line is a negative American line")
            if k in ("max_dog_line", "max_dog_line_parlay") and v < 0:
                raise HTTPException(400, f"{k} is a positive American line")
            if k in ("delay_sec", "cooloff_sec") and v < 0:
                raise HTTPException(400, f"{k} cannot be negative")
            setattr(lim, k, v)
    for k in _LIMIT_FLAGS:
        v = getattr(body, k)
        if v is not None:
            setattr(lim, k, int(v))
    if lim.min_straight_micros > lim.max_straight_micros:
        raise HTTPException(400, "min straight bet is above the max")
    if lim.min_parlay_micros > lim.max_parlay_micros:
        raise HTTPException(400, "min parlay bet is above the max")
    out = _limits_out(lim)
    await session.commit()
    return out


@router.get("/figures/collections")
async def collections(agent_q: str = "", agent: User = Depends(current_admin),
                      session: AsyncSession = Depends(get_session)):
    """The settle sheet: one row per customer, whole position at a glance.

    Balance = Carry + This Week + Payments.  Carry is what rolled in from
    previous weeks, This Week is the graded action not yet settled, Payments
    are the deposits/withdrawals keyed in this week, and Settle shows any
    figure squared up this week.
    """
    scope = await _scope_ids(session, agent)
    uq = select(User).where(User.is_admin == 0).order_by(User.id)
    if scope is not None:
        uq = uq.where(User.id.in_(scope))
    users = (await session.execute(uq)).scalars().all()

    admins = (await session.execute(select(User).where(User.is_admin == 1))).scalars().all()
    admin_names = {a.id: a.username for a in admins}

    ws = week_start()
    we = ws + timedelta(days=7)

    # settlements recorded this week, keyed by customer
    srows = (await session.execute(
        select(Settlement).where(Settlement.settled_at >= ws))).scalars().all()
    settled_week: dict[int, int] = {}
    settled_current: dict[int, int] = {}
    for s in srows:
        settled_week[s.user_id] = settled_week.get(s.user_id, 0) + s.figure_micros
        s_ws = s.week_start if s.week_start.tzinfo else s.week_start.replace(tzinfo=timezone.utc)
        if s_ws == ws:
            settled_current[s.user_id] = settled_current.get(s.user_id, 0) + s.figure_micros

    out = []
    tot = {"carry": 0, "settle": 0, "week": 0, "payments": 0, "balance": 0}
    for u in users:
        booked_by = admin_names.get(u.created_by) or agent.username
        if agent_q and agent_q.lower() not in booked_by.lower():
            continue
        wallet = await ledger.wallet_for(session, u.id)
        balance = await ledger.balance_of(session, wallet.id)
        fig = await _graded_figure(session, wallet.id, u.id, ws, we)
        payments = (await session.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0))
            .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
            .where(LedgerEntry.account_id == wallet.id,
                   LedgerTransaction.kind == "adjustment",
                   LedgerTransaction.created_at >= ws))).scalar() or 0
        this_week = fig["figure_micros"] - settled_current.get(u.id, 0)
        settle_amt = settled_week.get(u.id, 0)
        carry = balance - this_week - payments
        for k, v in (("carry", carry), ("settle", settle_amt), ("week", this_week),
                     ("payments", payments), ("balance", balance)):
            tot[k] += v
        out.append({
            "id": u.id, "account": f"L77{u.id:04d}", "username": u.username,
            "agent": booked_by, "active": bool(u.is_active),
            "settled_this_week": u.id in settled_current,
            "carry": str(from_micros(carry)),
            "settle": str(from_micros(settle_amt)),
            "this_week": str(from_micros(this_week)),
            "payments": str(from_micros(payments)),
            "balance": str(from_micros(balance)),
        })
    await session.commit()
    return {
        "week_start": ws.isoformat(),
        "customers": out,
        "totals": {k: str(from_micros(v)) for k, v in tot.items()},
    }


# ---------------------------------------------------------------- wagers ----
@router.get("/wagers")
async def wagers(status: str = "pending", limit: int = 100,
                 agent: User = Depends(current_admin),
                 session: AsyncSession = Depends(get_session)):
    """status: pending | graded | deleted | all"""
    scope = await _scope_ids(session, agent)
    q = (select(Bet, User).join(User, User.id == Bet.user_id)
         .order_by(desc(Bet.id)).limit(min(limit, 300)))
    if scope is not None:
        q = q.where(Bet.user_id.in_(scope))
    if status == "pending":
        q = q.where(Bet.status == "open")
    elif status == "deleted":
        q = q.where(Bet.status.in_(["void", "buyout"]))
    elif status == "graded":
        q = q.where(Bet.status.not_in(["open", "void", "buyout"]))
    # "all" filters nothing -- the ticker wants everything
    rows = (await session.execute(q)).all()

    agents = {a.id: a.username for a in (await session.execute(
        select(User).where(User.is_admin == 1))).scalars().all()}

    out = []
    for bet, user in rows:
        legs = (await session.execute(
            select(BetSelection, Selection, Market, Event)
            .join(Selection, Selection.id == BetSelection.selection_id)
            .join(Market, Market.id == Selection.market_id)
            .join(Event, Event.id == Market.event_id)
            .where(BetSelection.bet_id == bet.id))).all()
        out.append({
            "bet_id": bet.id, "customer": user.username,
            "account": f"L77{user.id:04d}",
            "agent": agents.get(user.created_by, "house"),
            "type": bet.type, "free_play": bool(bet.is_free_play),
            "status": bet.status, "stake": str(from_micros(bet.stake_micros)),
            "odds": bet.total_odds,
            "to_win": str(from_micros(bet.potential_micros - bet.stake_micros)),
            "risk": str(from_micros(bet.stake_micros)),
            "payout": (str(from_micros(bet.payout_micros))
                       if bet.payout_micros is not None else None),
            "placed_at": bet.placed_at.isoformat(),
            "legs": [{
                "selection": s.name, "market": m.name,
                "event": f"{e.home} v {e.away}", "odds": bs.odds_at_placement,
                "result": bs.result or s.result,
                "score": f"{e.home_score}-{e.away_score}" if e.home_score is not None else None,
            } for bs, s, m, e in legs],
        })
    await session.commit()
    return out


class BulkCustomers(BaseModel):
    count: int = Field(..., ge=1, le=50)
    prefix: str = Field(..., min_length=2, max_length=8, pattern=r"^[A-Za-z0-9]+$")
    start: int | None = Field(None, ge=1, le=999999)
    agent_id: int | None = None          # master may book onto a sub-agent's sheet
    credit_limit: str = "500"
    wager_limit: str | None = "500"


@router.post("/customers/bulk")
async def bulk_create_customers(body: BulkCustomers,
                                agent: User = Depends(current_admin),
                                session: AsyncSession = Depends(get_session)):
    """Mint a batch of numbered accounts: PREFIX1127, PREFIX1128, ...

    Passwords are random and returned exactly once. Taken numbers are skipped
    rather than erroring -- the point of bulk is not to babysit collisions.
    """
    owner = agent
    if body.agent_id is not None and body.agent_id != agent.id:
        if not agent.is_master:
            raise HTTPException(403, "only the master books onto another agent's sheet")
        owner = await session.get(User, body.agent_id)
        if owner is None or not owner.is_admin:
            raise HTTPException(404, "no such agent")

    try:
        credit = to_micros(Decimal(body.credit_limit))
        wager = to_micros(Decimal(body.wager_limit)) if body.wager_limit else None
    except InvalidOperation:
        raise HTTPException(400, "limits must be numbers")

    prefix = body.prefix.upper()
    taken = set((await session.execute(
        select(User.username).where(User.username.like(f"{prefix}%")))).scalars().all())

    if body.start is not None:
        num = body.start
    else:
        suffixes = [int(u[len(prefix):]) for u in taken
                    if u[len(prefix):].isdigit()]
        num = max(suffixes) + 1 if suffixes else 1001

    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # no lookalikes
    issued = []
    for _ in range(body.count):
        while f"{prefix}{num}" in taken:
            num += 1
        username = f"{prefix}{num}"
        taken.add(username)
        password = "".join(secrets.choice(alphabet) for _ in range(6))
        user = User(username=username, password_hash=hash_password(password),
                    is_admin=0, is_active=1, credit_limit_micros=credit,
                    wager_limit_micros=wager, created_by=owner.id)
        session.add(user)
        await session.flush()
        await ledger.wallet_for(session, user.id)
        await seeds.active_pair(session, user.id)
        issued.append({"account": f"L77{user.id:04d}", "username": username,
                       "password": password})
        num += 1

    await session.commit()
    return {
        "created": len(issued),
        "under_agent": owner.username,
        "credit_limit": str(from_micros(credit)),
        "wager_limit": str(from_micros(wager)) if wager else None,
        # shown once -- stored only as salted hashes
        "accounts": issued,
    }


# ------------------------------------------------------------ sub-agents ----
class NewAgent(BaseModel):
    username: str = Field(..., min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    password: str | None = Field(None, min_length=6, max_length=128)


@router.post("/agents")
async def create_agent(body: NewAgent, master: User = Depends(current_master),
                       session: AsyncSession = Depends(get_session)):
    """Master books a sub-agent. Sub-agents book customers; they cannot book
    other agents, so the tree is exactly two levels deep and stays auditable."""
    exists = (await session.execute(
        select(User).where(User.username == body.username))).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "username taken")

    password = body.password or secrets.token_urlsafe(9)
    agent = User(username=body.username, password_hash=hash_password(password),
                 is_admin=1, is_master=0, is_active=1, created_by=master.id)
    session.add(agent)
    await session.flush()
    await ledger.wallet_for(session, agent.id)
    await seeds.active_pair(session, agent.id)
    await session.commit()
    return {"id": agent.id, "username": agent.username,
            "password": password if body.password is None else None}


@router.get("/agents")
async def list_agents(master: User = Depends(current_master),
                      session: AsyncSession = Depends(get_session)):
    """Every sub-agent, their sheet size, and this week's figure on it."""
    since = week_start()
    agents = (await session.execute(
        select(User).where(User.is_admin == 1, User.is_master == 0)
        .order_by(User.username))).scalars().all()
    out = []
    for a in agents:
        customers = (await session.execute(
            select(User).where(User.is_admin == 0, User.created_by == a.id)
        )).scalars().all()
        fig = vol = 0
        wagers = 0
        for c in customers:
            wallet = await ledger.wallet_for(session, c.id)
            f = await _graded_figure(session, wallet.id, c.id, since)
            fig += f["figure_micros"]; vol += f["graded_volume_micros"]; wagers += f["wagers"]
        out.append({
            "id": a.id, "username": a.username, "active": bool(a.is_active),
            "customers": len(customers),
            "week_wagers": wagers,
            "week_volume": str(from_micros(vol)),
            # the agent's side of their sheet is the mirror of the customers'
            "week_figure": str(from_micros(-fig)),
            "created_at": a.created_at.isoformat(),
        })
    await session.commit()
    return out


class UpdateAgent(BaseModel):
    active: bool | None = None
    new_password: str | None = Field(None, min_length=6, max_length=128)


@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: int, body: UpdateAgent,
                       master: User = Depends(current_master),
                       session: AsyncSession = Depends(get_session)):
    """Suspend a sub-agent or reset their password.

    Suspending an agent does NOT suspend their customers -- the sheet still
    stands and the master can still settle it; the agent just loses the pen.
    """
    a = await session.get(User, agent_id)
    if a is None or not a.is_admin or a.is_master:
        raise HTTPException(404, "no such sub-agent")
    if body.active is not None:
        a.is_active = int(body.active)
    if body.new_password:
        a.password_hash = hash_password(body.new_password)
    await session.commit()
    return {"id": a.id, "username": a.username, "active": bool(a.is_active)}


# --------------------------------------------------------- console extras ----
@router.get("/billing")
async def billing(days: int = 30, agent: User = Depends(current_admin),
                  session: AsyncSession = Depends(get_session)):
    """The sheet's running statement.

    Two kinds of line: a weekly figure posting what the week's action did to
    the bill, and a settlement clearing what was squared up. The running
    balance therefore always ends at the sheet's current unsettled position.
    """
    scope = await _scope_ids(session, agent)
    uq = select(User).where(User.is_admin == 0)
    if scope is not None:
        uq = uq.where(User.id.in_(scope))
    users = (await session.execute(uq)).scalars().all()
    names = {u.id: u.username for u in users}

    # first week with any action on this sheet -- sports OR casino
    fq = select(func.min(Bet.placed_at))
    dq = select(func.min(DuelRound.created_at))
    if scope is not None:
        fq = fq.where(Bet.user_id.in_(scope))
        dq = dq.where(DuelRound.user_id.in_(scope))
    firsts = [(await session.execute(q)).scalar() for q in (fq, dq)]
    firsts = [f.replace(tzinfo=timezone.utc) if f is not None and f.tzinfo is None else f
              for f in firsts]
    first = min((f for f in firsts if f is not None), default=None)

    events: list[tuple[datetime, str, int]] = []
    now = datetime.now(timezone.utc)
    if first is not None:
        if first.tzinfo is None:
            first = first.replace(tzinfo=timezone.utc)
        w = week_start(first)
        while w <= now:
            net = 0
            for u in users:
                wallet = await ledger.wallet_for(session, u.id)
                f = await _graded_figure(session, wallet.id, u.id, w, w + timedelta(days=7))
                net += f["figure_micros"]
            if net != 0:
                current = w == week_start(now)
                stamp = now if current else w + timedelta(days=7, hours=6)
                label = (f"Weekly figure (to date) — week of {w.date().isoformat()}"
                         if current else f"Weekly figure — week of {w.date().isoformat()}")
                # the sheet's side of the week is the mirror of the customers'
                events.append((stamp, label, -net))
            w += timedelta(days=7)

    sq = select(Settlement).order_by(Settlement.settled_at)
    if scope is not None:
        sq = sq.where(Settlement.user_id.in_(scope))
    for s in (await session.execute(sq)).scalars().all():
        at = s.settled_at if s.settled_at.tzinfo else s.settled_at.replace(tzinfo=timezone.utc)
        desc = f"Settled {names.get(s.user_id, f'#{s.user_id}')}"
        if s.note:
            desc += f" — {s.note}"
        # clearing entry: the mirror of the weekly line it squares up
        events.append((at, desc, s.figure_micros))

    events.sort(key=lambda e: e[0])

    cutoff = now - timedelta(days=days) if days > 0 else None
    balance = 0
    rows = []
    forward = 0
    for at, desc, amount in events:
        balance += amount
        if cutoff and at < cutoff:
            forward = balance
            continue
        rows.append({"at": at.isoformat(), "description": desc,
                     "amount": str(from_micros(amount)),
                     "balance": str(from_micros(balance))})
    if cutoff and forward and (not rows or events[0][0] < cutoff):
        rows.insert(0, {"at": cutoff.isoformat(), "description": "Balance forward",
                        "amount": "", "balance": str(from_micros(forward))})

    await session.commit()
    return {"current_balance": str(from_micros(balance)), "days": days, "rows": rows,
            "note": "Positive = the sheet is owed; negative = the sheet owes. "
                    "Weekly lines post the action; settlements clear it."}


class VoidRequest(BaseModel):
    # a plain void refunds the stake; a buyout refunds an agreed price instead
    buyout: str | None = None


@router.post("/wagers/{bet_id}/void")
async def void_wager(bet_id: int, body: VoidRequest | None = None,
                     agent: User = Depends(current_admin),
                     session: AsyncSession = Depends(get_session)):
    """Cancel a pending wager.

    With no body it is a void: the stake comes straight back. With a buyout
    amount it is the agent buying the ticket back at an agreed price -- a
    winning-looking ticket bought back above stake, or a doomed one below.
    The ticket is kept either way; a deleted wager that vanished entirely
    would be indistinguishable from tampering, and the Deleted Wagers screen
    exists precisely so both sides can see what was cancelled.
    """
    bet = await session.get(Bet, bet_id)
    if bet is None:
        raise HTTPException(404, "no such wager")
    scope = await _scope_ids(session, agent)
    if not _in_scope(bet.user_id, scope):
        raise HTTPException(403, "that wager is on another agent's sheet")
    if bet.status != "open":
        raise HTTPException(409, f"wager is already {bet.status}")

    if body and body.buyout is not None:
        if bet.is_free_play:
            raise HTTPException(409, "free-play tickets can't be bought out — void instead")
        try:
            amount = to_micros(Decimal(body.buyout))
        except InvalidOperation:
            raise HTTPException(400, "buyout is not a number")
        if amount < 0:
            raise HTTPException(400, "buyout cannot be negative")
        if amount > bet.potential_micros:
            raise HTTPException(400, "buyout cannot exceed the ticket's full payout")
        new_status = "buyout"
    else:
        amount = bet.stake_micros
        new_status = "void"

    if bet.is_free_play:
        # the stake was free play, so the refund is free play
        fp_wallet = await ledger.fp_wallet_for(session, bet.user_id)
        fp_house = await ledger.fp_house_account(session)
        await ledger.transfer(
            session, idempotency_key=f"sb:{bet.id}:void", kind="freeplay_refund",
            src=fp_house.id, dst=fp_wallet.id, amount_micros=amount,
            ref_type="sports_bet", ref_id=bet.id,
        )
        bet.status, bet.payout_micros = "void", 0
        bet.settled_at = datetime.now(timezone.utc)
        await session.commit()
        return {"bet_id": bet.id, "status": "void",
                "refunded": str(from_micros(amount)) + " (free play)"}

    wallet = await ledger.wallet_for(session, bet.user_id)
    house = await ledger.house_account(session)
    if amount > 0:
        await ledger.transfer(
            session, idempotency_key=f"sb:{bet.id}:void", kind="bet_void",
            src=house.id, dst=wallet.id, amount_micros=amount,
            ref_type="sports_bet", ref_id=bet.id,
        )
    bet.status = new_status
    bet.payout_micros = amount
    bet.settled_at = datetime.now(timezone.utc)
    await session.commit()
    return {"bet_id": bet.id, "status": new_status,
            "refunded": str(from_micros(amount))}


def _amer_int(decimal_odds: str) -> int:
    d = Decimal(decimal_odds)
    if d >= 2:
        return round((d - 1) * 100)
    return round(Decimal(-100) / (d - 1))


def _points_beaten(key: str, placed: str | None, closing: str | None) -> Decimal | None:
    """How many points of line the bettor beat, signed in the bettor's favour."""
    if not placed or not closing:
        return None
    try:
        p, c = Decimal(placed), Decimal(closing)
    except InvalidOperation:
        return None
    if key in ("over",):
        return c - p            # total drifted up after an Over = points beaten
    if key in ("under",):
        return p - c
    if key in ("home",):
        return p - c            # home line is the market line itself
    if key in ("away",):
        return c - p
    return None


async def _clv_legs(session: AsyncSession, user_ids: list[int], since: datetime):
    """Every leg struck in the window, with its closing price alongside."""
    rows = (await session.execute(
        select(Bet, BetSelection, Selection, Market, Event)
        .join(BetSelection, BetSelection.bet_id == Bet.id)
        .join(Selection, Selection.id == BetSelection.selection_id)
        .join(Market, Market.id == Selection.market_id)
        .join(Event, Event.id == Market.event_id)
        .where(Bet.user_id.in_(user_ids), Bet.placed_at >= since)
        .order_by(Bet.placed_at))).all()
    return rows


@router.get("/analysis/closing")
async def closing_line_analysis(days: int = 14, agent: User = Depends(current_admin),
                                session: AsyncSession = Depends(get_session)):
    """Who is beating the closing line -- the one stat that separates sharp
    action from lucky action. A customer who consistently gets a better number
    than the market closed at is reading the market faster than the book."""
    scope = await _scope_ids(session, agent)
    uq = select(User).where(User.is_admin == 0)
    if scope is not None:
        uq = uq.where(User.id.in_(scope))
    users = (await session.execute(uq)).scalars().all()
    if not users:
        return {"days": days, "customers": []}

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = await _clv_legs(session, [u.id for u in users], since)

    per: dict[int, dict] = {}
    bets_seen: dict[int, set[int]] = {}
    for bet, bs, sel, market, event in rows:
        d = per.setdefault(bet.user_id, {
            "legs": 0, "beat": 0, "cents": [], "points": [], "win_loss": 0})
        bets_seen.setdefault(bet.user_id, set())
        if bet.id not in bets_seen[bet.user_id]:
            bets_seen[bet.user_id].add(bet.id)
            if bet.status not in ("open",):
                d["win_loss"] += (bet.payout_micros or 0) - bet.stake_micros
        placed, closing = bs.odds_at_placement, sel.odds_decimal
        cents = _amer_int(placed) - _amer_int(closing)
        pts = _points_beaten(sel.key, bs.line_at_placement, market.line)
        beat = (pts is not None and pts > 0) or (pts in (None, 0) and cents > 0)
        d["legs"] += 1
        d["beat"] += 1 if beat else 0
        d["cents"].append(cents)
        if pts is not None:
            d["points"].append(pts)

    out = []
    for u in users:
        d = per.get(u.id)
        if d is None:
            continue
        total_bets = len(bets_seen.get(u.id, ()))
        pct = (d["beat"] / d["legs"] * 100) if d["legs"] else 0.0
        avg_cents = sum(d["cents"]) / len(d["cents"]) if d["cents"] else 0
        avg_pts = (sum(d["points"]) / len(d["points"])) if d["points"] else None
        out.append({
            "id": u.id, "account": f"L77{u.id:04d}", "username": u.username,
            "points": str(round(avg_pts, 2)) if avg_pts is not None else None,
            "price": round(avg_cents, 2),
            "beat_line": d["beat"], "total_bets": total_bets,
            "percentage": round(pct, 2),
            "win_loss": str(from_micros(d["win_loss"])),
            # the red row: enough volume to mean something, beating the close
            "flagged": d["legs"] >= 5 and pct >= 60,
        })
    out.sort(key=lambda r: (r["total_bets"], r["account"]))
    await session.commit()
    return {"days": days, "customers": out,
            "note": "Price is the average American-cents edge versus the closing "
                    "number; Points the same for spreads and totals. Beating the "
                    "close consistently is the signature of sharp action."}


@router.get("/analysis/closing/{user_id}")
async def closing_line_detail(user_id: int, days: int = 14,
                              agent: User = Depends(current_admin),
                              session: AsyncSession = Depends(get_session)):
    """The full analysis behind one customer's row: every leg, placed vs close."""
    user = await session.get(User, user_id)
    if user is None or user.is_admin:
        raise HTTPException(404, "no such customer")
    scope = await _scope_ids(session, agent)
    if not _in_scope(user.id, scope):
        raise HTTPException(403, "that customer is on another agent's sheet")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = await _clv_legs(session, [user.id], since)
    out = []
    for bet, bs, sel, market, event in rows:
        cents = _amer_int(bs.odds_at_placement) - _amer_int(sel.odds_decimal)
        pts = _points_beaten(sel.key, bs.line_at_placement, market.line)
        out.append({
            "bet_id": bet.id, "placed_at": bet.placed_at.isoformat(),
            "event": f"{event.home} v {event.away}",
            "market": market.name, "selection": sel.name,
            "placed_odds": bs.odds_at_placement, "closing_odds": sel.odds_decimal,
            "placed_line": bs.line_at_placement, "closing_line": market.line,
            "cents": cents, "points": str(pts) if pts is not None else None,
            "beat": (pts is not None and pts > 0) or (pts in (None, 0) and cents > 0),
            "status": bet.status,
        })
    await session.commit()
    return {"username": user.username, "account": f"L77{user.id:04d}",
            "days": days, "legs": out}


@router.get("/analysis")
async def analysis(agent: User = Depends(current_admin),
                   session: AsyncSession = Depends(get_session)):
    """Handle and result by sport. Parlays are attributed to their first leg's
    sport (stated on the screen) -- splitting a parlay's stake across sports
    would just invent numbers."""
    scope = await _scope_ids(session, agent)
    qa = (select(Bet, Sport.name, Sport.icon)
        .join(BetSelection, BetSelection.bet_id == Bet.id)
        .join(Selection, Selection.id == BetSelection.selection_id)
        .join(Market, Market.id == Selection.market_id)
        .join(Event, Event.id == Market.event_id)
        .join(Competition, Competition.id == Event.competition_id)
        .join(Sport, Sport.id == Competition.sport_id)
        .order_by(Bet.id, BetSelection.id))
    if scope is not None:
        qa = qa.where(Bet.user_id.in_(scope))
    rows = (await session.execute(qa)).all()

    seen: set[int] = set()
    agg: dict[str, dict] = {}
    for bet, sport_name, icon in rows:
        if bet.id in seen:
            continue  # first leg only
        seen.add(bet.id)
        a = agg.setdefault(sport_name, {
            "sport": sport_name, "icon": icon, "wagers": 0, "open": 0,
            "staked_micros": 0, "paid_micros": 0,
        })
        a["wagers"] += 1
        a["staked_micros"] += bet.stake_micros
        if bet.status == "open":
            a["open"] += 1
        elif bet.payout_micros:
            a["paid_micros"] += bet.payout_micros

    out = []
    for a in agg.values():
        graded_stake = a["staked_micros"]
        book = graded_stake - a["paid_micros"]
        out.append({
            "sport": a["sport"], "icon": a["icon"], "wagers": a["wagers"],
            "open": a["open"],
            "staked": str(from_micros(a["staked_micros"])),
            "paid_out": str(from_micros(a["paid_micros"])),
            "book_result": str(from_micros(book)),
        })
    out.sort(key=lambda r: -Decimal(r["staked"]))
    await session.commit()
    return {"sports": out,
            "note": "Parlays are attributed to their first leg's sport."}



_TXN_KINDS = {
    "player": ("adjustment",),
    "wagers": ("bet_place", "bet_settle", "bet_void"),
    "settlements": ("settlement",),
}


@router.get("/transactions")
async def transactions(kind: str = "player", agent_q: str = "", player_q: str = "",
                       date_from: str = "", date_to: str = "",
                       user_id: int | None = None, limit: int = 300,
                       agent: User = Depends(current_admin),
                       session: AsyncSession = Depends(get_session)):
    """Money movements on customer wallets, oldest first, with a total.

    The default view is Player Transactions -- the deposits and withdrawals
    agents key in. Wagers, settlements, or the whole raw ledger feed are a
    dropdown away; when a figure looks surprising this is where you find out
    why.
    """
    scope = await _scope_ids(session, agent)
    q = (select(LedgerEntry, LedgerTransaction, User)
         .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
         .join(Account, Account.id == LedgerEntry.account_id)
         .join(User, User.id == Account.user_id)
         .where(Account.kind == "user_wallet")
         .order_by(LedgerEntry.id).limit(min(limit, 1000)))
    if scope is not None:
        q = q.where(User.id.in_(scope))
    if user_id is not None:
        if not _in_scope(user_id, scope):
            raise HTTPException(403, "that customer is on another agent's sheet")
        q = q.where(User.id == user_id)
    if kind in _TXN_KINDS:
        q = q.where(LedgerTransaction.kind.in_(_TXN_KINDS[kind]))
    for bound, param in (("date_from", date_from), ("date_to", date_to)):
        if param:
            try:
                d = datetime.fromisoformat(param).replace(tzinfo=timezone.utc)
            except ValueError:
                raise HTTPException(400, f"{bound} is not a date")
            q = q.where(LedgerTransaction.created_at >= d if bound == "date_from"
                        else LedgerTransaction.created_at < d + timedelta(days=1))
    rows = (await session.execute(q)).all()

    admins = (await session.execute(select(User).where(User.is_admin == 1))).scalars().all()
    admin_names = {a.id: a.username for a in admins}

    label = {"adjustment": ("Deposit", "Withdrawal"),
             "bet_place": ("Wager", "Wager"), "bet_settle": ("Payout", "Payout"),
             "bet_void": ("Void refund", "Void refund"),
             "settlement": ("Settlement", "Settlement"),
             "account_open": ("Account open", "Account open")}
    desc_of = {"adjustment": ("Customer Deposit", "Customer Withdraw"),
               "bet_place": ("Wager placed", "Wager placed"),
               "bet_settle": ("Wager graded", "Wager graded"),
               "bet_void": ("Wager voided — stake refunded",) * 2,
               "settlement": ("Weekly figure settled",) * 2,
               "account_open": ("Account opened",) * 2}

    out, total = [], 0
    for e, t, u in rows:
        booked_by = admin_names.get(u.created_by) or agent.username
        if agent_q and agent_q.lower() not in booked_by.lower():
            continue
        acct = f"L77{u.id:04d}"
        if player_q and player_q.lower() not in u.username.lower() \
                and player_q.lower() not in acct.lower():
            continue
        i = 0 if e.amount_micros >= 0 else 1
        entered = "—"
        if t.kind == "adjustment" and t.ref_type == "agent":
            entered = "ME" if t.ref_id == agent.id else admin_names.get(t.ref_id, "—")
        elif t.kind == "settlement":
            entered = booked_by if booked_by != agent.username else "ME"
        total += e.amount_micros
        out.append({"id": e.id, "at": t.created_at.isoformat(), "agent": booked_by,
                    "customer": u.username, "account": acct,
                    "kind": label.get(t.kind, (t.kind, t.kind))[i],
                    "description": desc_of.get(t.kind, (t.kind, t.kind))[i],
                    "amount": str(from_micros(e.amount_micros)),
                    "entered_by": entered})
    await session.commit()
    return {"rows": out, "total": str(from_micros(total))}


@router.get("/scores")
async def scores(agent: User = Depends(current_admin),
                 session: AsyncSession = Depends(get_session)):
    """The scoreboard: every game, finals first within each sport."""
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


@router.get("/game-admin")
async def game_admin(agent: User = Depends(current_master),
                     session: AsyncSession = Depends(get_session)):
    """Feed state for the Game Admin screen."""
    scheduled = (await session.execute(
        select(func.count()).select_from(Event).where(Event.status == "scheduled"))).scalar() or 0
    ended = (await session.execute(
        select(func.count()).select_from(Event).where(Event.status == "ended"))).scalar() or 0
    open_bets = (await session.execute(
        select(func.count()).select_from(Bet).where(Bet.status == "open"))).scalar() or 0
    await session.commit()
    return {"scheduled_events": scheduled, "ended_events": ended, "open_wagers": open_bets}


@router.get("/games")
async def games_board(agent: User = Depends(current_master),
                      session: AsyncSession = Depends(get_session)):
    """The game board: every event with its rotation numbers, state and
    controls' current position. Rotation numbers follow the odd/even pair
    convention and are derived from the event id, so they never collide."""
    rows = (await session.execute(
        select(Event, Competition, Sport)
        .join(Competition, Competition.id == Event.competition_id)
        .join(Sport, Sport.id == Competition.sport_id)
        .order_by(Sport.name, Event.starts_at)
    )).all()

    out = []
    for ev, comp, sp in rows:
        open_markets = (await session.execute(
            select(func.count()).select_from(Market)
            .where(Market.event_id == ev.id, Market.status == "open"))).scalar() or 0
        suspended = (await session.execute(
            select(func.count()).select_from(Market)
            .where(Market.event_id == ev.id, Market.status == "suspended"))).scalar() or 0
        pending = (await session.execute(
            select(func.count(func.distinct(BetSelection.bet_id)))
            .join(Selection, Selection.id == BetSelection.selection_id)
            .join(Market, Market.id == Selection.market_id)
            .join(Bet, Bet.id == BetSelection.bet_id)
            .where(Market.event_id == ev.id, Bet.status == "open"))).scalar() or 0
        out.append({
            "id": ev.id,
            "sport": sp.name, "icon": sp.icon, "competition": comp.name,
            "home": ev.home, "away": ev.away,
            "home_rot": 899 + 2 * ev.id, "away_rot": 900 + 2 * ev.id,
            "starts_at": ev.starts_at.isoformat(),
            "status": ev.status, "period": ev.period,
            "score": (f"{ev.home_score}-{ev.away_score}"
                      if ev.home_score is not None else None),
            "circled": bool(ev.circled),
            "off_board": open_markets == 0 and suspended > 0,
            "open_markets": open_markets, "suspended_markets": suspended,
            "pending_wagers": pending,
        })
    await session.commit()
    return {"games": out, "circled_max": settings.circled_max_credits}


@router.get("/position")
async def position_matrix(agent: User = Depends(current_master),
                          session: AsyncSession = Depends(get_session)):
    """The position matrix: per game, per side, what's riding on each market
    type, split straights vs parlays. Every cell carries all three views --
    to-win ($), risk (R) and ticket count (#) -- and the client toggles.

    A parlay's full stake and potential land on every leg's cell: that's the
    standard position view, because any one leg can be the one that decides it.
    """
    # every scheduled game goes on the matrix, action or not, like the board
    ev_rows = (await session.execute(
        select(Event, Competition, Sport)
        .join(Competition, Competition.id == Event.competition_id)
        .join(Sport, Sport.id == Competition.sport_id)
        .where(Event.status == "scheduled")
        .order_by(Sport.name, Event.starts_at)
    )).all()

    def blank_cell():
        return {"w": 0, "r": 0, "c": 0}

    def blank_row():
        return {k: {b: blank_cell() for b in ("spread", "total", "ml", "other")}
                for k in ("straight", "parlay", "teaser", "reverse")}

    games: dict[int, dict] = {}
    for ev, comp, sp in ev_rows:
        games[ev.id] = {
            "id": ev.id, "sport": sp.name, "icon": sp.icon, "league": comp.name,
            "starts_at": ev.starts_at.isoformat(),
            "score": (f"{ev.home_score}-{ev.away_score}"
                      if ev.home_score is not None else None),
            "circled": bool(ev.circled),
            "rows": [
                {"rot": 899 + 2 * ev.id, "team": ev.home, "cells": blank_row()},
                {"rot": 900 + 2 * ev.id, "team": ev.away, "cells": blank_row()},
            ],
        }

    BUCKET = {"spreads": "spread", "totals": "total", "h2h": "ml",
              "btts": "other", "double_chance": "other"}
    HOME_KEYS = {"home", "over", "yes"}

    leg_rows = (await session.execute(
        select(Bet, Selection, Market)
        .join(BetSelection, BetSelection.bet_id == Bet.id)
        .join(Selection, Selection.id == BetSelection.selection_id)
        .join(Market, Market.id == Selection.market_id)
        .where(Bet.status == "open")
    )).all()

    totals = blank_row()
    for bet, sel, market in leg_rows:
        g = games.get(market.event_id)
        if g is None:
            continue
        bucket = BUCKET.get(market.type, "other")
        if market.type == "h2h" and sel.key == "draw":
            bucket = "other"
        row = g["rows"][0] if sel.key in HOME_KEYS else g["rows"][1]
        kind = {"single": "straight", "parlay": "parlay", "teaser": "teaser",
                "if_win": "reverse", "if_action": "reverse",
                "reverse": "reverse"}.get(bet.type, "parlay")
        for target in (row["cells"][kind][bucket], totals[kind][bucket]):
            target["w"] += bet.potential_micros - bet.stake_micros
            target["r"] += bet.stake_micros
            target["c"] += 1

    def fmt_cell(c):
        return {"w": str(from_micros(c["w"])), "r": str(from_micros(c["r"])),
                "c": c["c"]}

    def fmt_row(cells):
        return {k: {b: fmt_cell(cells[k][b]) for b in cells[k]} for k in cells}

    out_sports: dict[str, dict] = {}
    for g in games.values():
        s = out_sports.setdefault(g["sport"], {
            "sport": g["sport"], "icon": g["icon"], "games": []})
        s["games"].append({
            **{k: g[k] for k in ("id", "league", "starts_at", "score", "circled")},
            "rows": [{"rot": r["rot"], "team": r["team"],
                      "cells": fmt_row(r["cells"])} for r in g["rows"]],
        })

    await session.commit()
    return {"sports": list(out_sports.values()), "totals": fmt_row(totals)}


class BoardAction(BaseModel):
    open: bool


@router.post("/games/{event_id}/board")
async def set_board(event_id: int, body: BoardAction,
                    agent: User = Depends(current_master),
                    session: AsyncSession = Depends(get_session)):
    """Pull a game off the board or put it back. Suspended markets refuse new
    wagers instantly; tickets already written stand and grade as normal."""
    ev = await session.get(Event, event_id)
    if ev is None:
        raise HTTPException(404, "no such game")
    if ev.status != "scheduled":
        raise HTTPException(409, f"game is {ev.status}")
    markets = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.status.in_(["open", "suspended"])))).scalars().all()
    for m in markets:
        m.status = "open" if body.open else "suspended"
    await session.commit()
    return {"id": ev.id, "off_board": not body.open, "markets": len(markets)}


class CircleAction(BaseModel):
    circled: bool


@router.post("/games/{event_id}/circle")
async def set_circle(event_id: int, body: CircleAction,
                     agent: User = Depends(current_master),
                     session: AsyncSession = Depends(get_session)):
    """Circle a game: it stays on the board but stakes cap at the circled
    limit. The classic move when a line is suspect."""
    ev = await session.get(Event, event_id)
    if ev is None:
        raise HTTPException(404, "no such game")
    ev.circled = int(body.circled)
    await session.commit()
    return {"id": ev.id, "circled": bool(ev.circled),
            "circled_max": settings.circled_max_credits}


@router.post("/games/{event_id}/grade")
async def grade_one(event_id: int, agent: User = Depends(current_master),
                    session: AsyncSession = Depends(get_session)):
    """End one game, grade every selection on it, and settle finished wagers."""
    from ..sportsbook import ingest, settlement

    ev = await session.get(Event, event_id)
    if ev is None:
        raise HTTPException(404, "no such game")
    if ev.status != "scheduled":
        raise HTTPException(409, f"game is already {ev.status}")

    provider = ingest.get_provider()
    results = await provider.fetch_results([ev.provider_id])
    score = results.get(ev.provider_id)
    if score is None:
        raise HTTPException(502, "no result available for this game")

    await settlement.grade_event(session, ev, score[0], score[1])
    report = await settlement.settle_bets(session)
    await session.commit()
    return {"id": ev.id, "score": f"{score[0]}-{score[1]}", "settlement": report}


def _window_range(window: str) -> tuple[datetime, datetime | None]:
    now = datetime.now(timezone.utc)
    if window == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0), None
    if window == "week":
        return week_start(), None
    if window == "lastweek":
        s = week_start() - timedelta(days=7)
        return s, s + timedelta(days=7)
    if window == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), None
    return datetime(2000, 1, 1, tzinfo=timezone.utc), None   # "all"


@router.get("/performance-report")
async def performance_report(window: str = "today", action: str = "all",
                             agent: User = Depends(current_admin),
                             session: AsyncSession = Depends(get_session)):
    """Customer performance over a chosen window, groupable by agent.

    action: all | sportsbook | casino. Product attribution comes from the
    ledger's own ref_type on each entry, so the split can't drift from where
    the money actually moved.
    """
    since, until = _window_range(window)
    ref_types = (("sports_bet", "race_bet") if action == "sportsbook"
                 else ("duel_round", "dice_roll", "wheel_spin", "slot_spin", "vslot_spin", "holdspin_spin", "roulette_spin", "vp_hand", "baccarat_coup", "mines_round", "crash_round", "plinko_drop",
                       "blackjack_hand") if action == "casino" else None)

    scope = await _scope_ids(session, agent)
    q = select(User).where(User.is_admin == 0).order_by(User.username)
    if scope is not None:
        q = q.where(User.id.in_(scope))
    users = (await session.execute(q)).scalars().all()
    agents = {a.id: a.username for a in (await session.execute(
        select(User).where(User.is_admin == 1))).scalars().all()}

    rows = []
    tot = {"wagers": 0, "volume": 0, "figure": 0, "pending": 0}
    for u in users:
        wallet = await ledger.wallet_for(session, u.id)
        f = await _figure(session, wallet.id, since, until, ref_types=ref_types)
        # duel grades instantly; pending only exists on the sportsbook side
        pending = (0 if action == "casino"
                   else await _pending_stake(session, u.id, since, until))
        figure = f["figure_micros"] + pending
        if f["wagers"] == 0 and figure == 0:
            continue
        rows.append({
            "id": u.id, "account": f"L77{u.id:04d}", "username": u.username,
            "agent": agents.get(u.created_by, "house"), "active": bool(u.is_active),
            "wagers": f["wagers"],
            "volume": str(from_micros(f["volume_micros"] - pending)),
            "figure": str(from_micros(figure)),
            "pending": str(from_micros(pending)),
        })
        tot["wagers"] += f["wagers"]
        tot["volume"] += f["volume_micros"] - pending
        tot["figure"] += figure
        tot["pending"] += pending

    await session.commit()
    return {
        "window": window, "action": action, "since": since.isoformat(),
        "customers": rows,
        "totals": {
            "wagers": tot["wagers"],
            "volume": str(from_micros(tot["volume"])),
            "figure": str(from_micros(tot["figure"])),
            "pending": str(from_micros(tot["pending"])),
            "book_figure": str(from_micros(-tot["figure"])),
        },
    }


# ----------------------------------------------------------- performance ----
@router.get("/performance")
async def performance(agent: User = Depends(current_admin),
                      session: AsyncSession = Depends(get_session)):
    """Master: the whole book, balance = the house account.

    Sub-agent: their sheet only, balance = the unsettled figure across it --
    total graded customer net since forever, minus figures already settled,
    mirrored to the agent's side. That is the number they'd square up on today.
    """
    house = await ledger.house_account(session)
    this_week = week_start()
    scope = await _scope_ids(session, agent)
    epoch = EPOCH

    async def sheet_figure(since, until=None) -> dict:
        if scope is None:
            # the house account sits on the other side of every bet
            return await _graded_figure(session, house.id, None, since, until)
        total = {"figure_micros": 0, "graded_volume_micros": 0,
                 "pending_micros": 0, "wagers": 0}
        for uid in scope:
            wallet = await ledger.wallet_for(session, uid)
            f = await _graded_figure(session, wallet.id, uid, since, until)
            # mirror the customers' side onto the agent's
            total["figure_micros"] -= f["figure_micros"]
            total["graded_volume_micros"] += f["graded_volume_micros"]
            total["pending_micros"] += f["pending_micros"]
            total["wagers"] += f["wagers"]
        return total

    weeks = []
    for i in range(4):
        s = this_week - timedelta(weeks=i)
        f = await sheet_figure(s, s + timedelta(days=7))
        weeks.append({
            "week_start": s.date().isoformat(),
            "wagers": f["wagers"],
            "volume": str(from_micros(f["graded_volume_micros"])),
            "book_figure": str(from_micros(f["figure_micros"])),
            "pending": str(from_micros(f["pending_micros"])),
            "hold_pct": (str(round(Decimal(f["figure_micros"]) / Decimal(f["graded_volume_micros"]) * 100, 2))
                         if f["graded_volume_micros"] else "0"),
        })

    cq = select(func.count()).select_from(User).where(User.is_admin == 0)
    aq = select(func.count()).select_from(User).where(User.is_admin == 0, User.is_active == 1)
    rq = select(func.coalesce(func.sum(Bet.stake_micros), 0)).where(Bet.status == "open")
    lq = select(func.coalesce(func.sum(Bet.potential_micros), 0)).where(Bet.status == "open")
    if scope is not None:
        cq = cq.where(User.created_by == agent.id)
        aq = aq.where(User.created_by == agent.id)
        rq = rq.where(Bet.user_id.in_(scope))
        lq = lq.where(Bet.user_id.in_(scope))
    customers = (await session.execute(cq)).scalar() or 0
    active = (await session.execute(aq)).scalar() or 0
    open_risk = (await session.execute(rq)).scalar() or 0
    open_liability = (await session.execute(lq)).scalar() or 0
    duel_rounds = (await session.execute(
        select(func.count()).select_from(DuelRound))).scalar() or 0

    if scope is None:
        balance = await ledger.balance_of(session, house.id)
    else:
        all_time = await sheet_figure(epoch)
        settled = (await session.execute(
            select(func.coalesce(func.sum(Settlement.figure_micros), 0))
            .where(Settlement.user_id.in_(scope)))).scalar() or 0
        # figures already squared up drop out of what's owed today
        balance = all_time["figure_micros"] + settled

    await session.commit()
    return {
        "scope": "master" if scope is None else "agent",
        "house_balance": str(from_micros(balance)),
        "customers": customers, "active_customers": active,
        "open_wagers_risk": str(from_micros(open_risk)),
        "open_wagers_liability": str(from_micros(open_liability)),
        "duel_rounds": duel_rounds,
        "weeks": weeks,
        "note": "Figures are computed from ledger entries, never stored separately, "
                "so a report cannot drift from what actually happened.",
    }


# ------------------------------------------------------------ player props ----
@router.get("/props")
async def props_open(status: str = "open", agent: User = Depends(current_master),
                     session: AsyncSession = Depends(get_session)):
    """Props grade THEMSELVES from the stats feed after full time, and void
    with a refund after 24h if the feed can't answer. This endpoint is the
    emergency override only."""
    from ..sportsbook.models import Event, Market, Selection
    q = (select(Market, Event).join(Event, Event.id == Market.event_id)
         .where(Market.type.like("prop:%"))
         .order_by(Event.starts_at, Market.id))
    if status == "open":
        q = q.where(Market.status.in_(["open", "suspended"]))
    rows = (await session.execute(q)).all()
    out = []
    for m, ev in rows:
        sels = (await session.execute(
            select(Selection).where(Selection.market_id == m.id)
            .order_by(Selection.id))).scalars().all()
        out.append({
            "market_id": m.id, "type": m.type, "name": m.name, "line": m.line,
            "status": m.status, "event": f"{ev.home} v {ev.away}",
            "event_status": ev.status, "starts_at": ev.starts_at.isoformat(),
            "selections": [{"key": x.key, "name": x.name, "result": x.result}
                           for x in sels],
        })
    await session.commit()
    return out


class PropGrade(BaseModel):
    actual: str | None = None      # the real stat, e.g. "7" strikeouts
    void: bool = False


@router.post("/props/{market_id}/grade")
async def props_grade(market_id: int, req: PropGrade,
                      agent: User = Depends(current_master),
                      session: AsyncSession = Depends(get_session)):
    from ..sportsbook.models import Market, Selection
    from ..sportsbook.settlement import settle_bets
    m = await session.get(Market, market_id)
    if m is None or not m.type.startswith("prop:"):
        raise HTTPException(404, "no such prop market")
    if m.status == "settled":
        raise HTTPException(409, "already graded")
    sels = (await session.execute(
        select(Selection).where(Selection.market_id == m.id))).scalars().all()

    from ..sportsbook.props import grade_prop_market, void_prop_market
    if req.void:
        void_prop_market(m, sels)
    else:
        if req.actual is None:
            raise HTTPException(400, "enter the actual stat, or void")
        try:
            actual = Decimal(req.actual)
        except InvalidOperation:
            raise HTTPException(400, "actual is not a number")
        grade_prop_market(m, sels, actual)
    report = await settle_bets(session)
    await session.commit()
    return {"market": m.name, "graded": len(sels),
            "void": req.void, "settlement": report}
