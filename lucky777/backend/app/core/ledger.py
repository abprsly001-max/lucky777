"""The ONLY module allowed to write ledger_entries.

Every vertical (casino, sportsbook, prediction markets) calls post() and
nothing else. That single rule is what keeps the money layer auditable.

Invariants enforced here:
  * every transaction's entries sum to exactly zero
  * user wallets can never go negative (checked atomically, not read-then-write)
  * posting the same idempotency_key twice is a no-op that returns the original
"""
from dataclasses import dataclass

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Account, AccountBalance, LedgerEntry, LedgerTransaction

HOUSE = "house"
USER_WALLET = "user_wallet"
# only these account kinds may hold a negative balance
MAY_GO_NEGATIVE = {HOUSE, "faucet"}


class InsufficientFunds(Exception):
    pass


class UnbalancedTransaction(Exception):
    pass


@dataclass(frozen=True)
class Leg:
    account_id: int
    amount_micros: int  # signed
    # lowest balance this leg may leave behind. 0 = prepaid; a customer betting
    # on credit gets floor = -credit_limit. The check stays atomic either way.
    floor_micros: int = 0


async def get_or_create_account(session: AsyncSession, kind: str, user_id: int | None = None,
                                currency: str = "CREDIT") -> Account:
    q = select(Account).where(Account.kind == kind, Account.currency == currency,
                              Account.user_id.is_(user_id) if user_id is None
                              else Account.user_id == user_id)
    acct = (await session.execute(q)).scalar_one_or_none()
    if acct:
        return acct
    acct = Account(kind=kind, user_id=user_id, currency=currency)
    session.add(acct)
    await session.flush()
    session.add(AccountBalance(account_id=acct.id, balance_micros=0))
    await session.flush()
    return acct


async def house_account(session: AsyncSession) -> Account:
    return await get_or_create_account(session, HOUSE, None)


async def wallet_for(session: AsyncSession, user_id: int) -> Account:
    return await get_or_create_account(session, USER_WALLET, user_id)


# Free play is its own currency: it can never mix with real credits inside a
# transaction, the zero-sum invariant holds per currency, and the integrity
# check stays honest. Issuing FP moves it house->player; staking moves it back;
# only the WINNINGS of a free-play ticket are ever paid out in real credits.
async def fp_house_account(session: AsyncSession) -> Account:
    return await get_or_create_account(session, HOUSE, None, currency="FREEPLAY")


async def fp_wallet_for(session: AsyncSession, user_id: int) -> Account:
    return await get_or_create_account(session, USER_WALLET, user_id, currency="FREEPLAY")


async def balance_of(session: AsyncSession, account_id: int) -> int:
    row = await session.get(AccountBalance, account_id)
    return row.balance_micros if row else 0


async def post(
    session: AsyncSession,
    *,
    idempotency_key: str,
    kind: str,
    legs: list[Leg],
    ref_type: str | None = None,
    ref_id: int | None = None,
) -> LedgerTransaction:
    """Atomically post a balanced set of entries. Caller owns the transaction."""
    total = sum(l.amount_micros for l in legs)
    if total != 0:
        raise UnbalancedTransaction(f"legs sum to {total}, must be 0")

    # idempotency: the unique index is the source of truth
    existing = (
        await session.execute(
            select(LedgerTransaction).where(LedgerTransaction.idempotency_key == idempotency_key)
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    txn = LedgerTransaction(idempotency_key=idempotency_key, kind=kind,
                            ref_type=ref_type, ref_id=ref_id)
    session.add(txn)
    try:
        await session.flush()
    except IntegrityError:  # lost a race; the other writer won
        await session.rollback()
        raise

    currencies = set()
    for leg in legs:
        acct = await session.get(Account, leg.account_id)
        if acct is None:
            raise ValueError(f"no such account {leg.account_id}")
        currencies.add(acct.currency)
    if len(currencies) > 1:
        # a "balanced" transaction across currencies would mint real money
        # out of free play; nothing legitimate ever needs to do this
        raise UnbalancedTransaction(f"legs span currencies {sorted(currencies)}")

    for leg in legs:
        acct = await session.get(Account, leg.account_id)

        # Atomic conditional update. Never read-then-write: two concurrent bets
        # would both pass a stale balance check and overdraw the wallet.
        stmt = (
            update(AccountBalance)
            .where(AccountBalance.account_id == leg.account_id)
            .values(balance_micros=AccountBalance.balance_micros + leg.amount_micros)
        )
        if acct.kind not in MAY_GO_NEGATIVE and leg.amount_micros < 0:
            stmt = stmt.where(
                AccountBalance.balance_micros + leg.amount_micros >= leg.floor_micros)

        res = await session.execute(stmt)
        if res.rowcount != 1:
            raise InsufficientFunds(f"account {leg.account_id} cannot cover {leg.amount_micros}")

        session.add(LedgerEntry(transaction_id=txn.id, account_id=leg.account_id,
                                amount_micros=leg.amount_micros))

    await session.flush()
    return txn


async def transfer(
    session: AsyncSession, *, idempotency_key: str, kind: str,
    src: int, dst: int, amount_micros: int,
    ref_type: str | None = None, ref_id: int | None = None,
    src_floor_micros: int = 0,
) -> LedgerTransaction:
    return await post(
        session, idempotency_key=idempotency_key, kind=kind,
        legs=[Leg(src, -amount_micros, floor_micros=src_floor_micros),
              Leg(dst, +amount_micros)],
        ref_type=ref_type, ref_id=ref_id,
    )


# ------------------------------------------------------------- integrity ----
async def check_integrity(session: AsyncSession) -> dict:
    """Run this nightly. Any nonzero result means a bug is minting money."""
    global_sum = (await session.execute(text("SELECT COALESCE(SUM(amount_micros),0) FROM ledger_entries"))).scalar()
    unbalanced = (await session.execute(text("""
        SELECT COUNT(*) FROM (
          SELECT transaction_id FROM ledger_entries
          GROUP BY transaction_id HAVING SUM(amount_micros) <> 0
        ) x"""))).scalar()
    drift = (await session.execute(text("""
        SELECT COUNT(*) FROM account_balances b
        LEFT JOIN (SELECT account_id, SUM(amount_micros) s FROM ledger_entries GROUP BY account_id) e
          ON e.account_id = b.account_id
        WHERE b.balance_micros <> COALESCE(e.s, 0)"""))).scalar()
    negative = (await session.execute(text("""
        SELECT COUNT(*) FROM account_balances b
        JOIN accounts a ON a.id = b.account_id
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.kind NOT IN ('house','faucet')
          AND b.balance_micros < -COALESCE(u.credit_limit_micros, 0)"""))).scalar()
    return {
        "global_sum_micros": global_sum,
        "unbalanced_transactions": unbalanced,
        "cache_drift_accounts": drift,
        "illegally_negative_accounts": negative,
        "ok": global_sum == 0 and unbalanced == 0 and drift == 0 and negative == 0,
    }
