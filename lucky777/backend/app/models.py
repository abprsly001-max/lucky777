from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# SQLite only autoincrements INTEGER primary keys, not BIGINT. This variant
# keeps BIGINT on Postgres while staying portable to the dev SQLite file.
BigInt = BigInteger().with_variant(Integer, "sqlite")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # 0 = customer, 1 = agent. Agents run a sheet of customers; they are NOT
    # given any edge inside a game.
    is_admin: Mapped[int] = mapped_column(Integer, default=0)
    # 1 = the master agent: sees every sheet, creates sub-agents, runs the feed.
    # Sub-agents (is_admin=1, is_master=0) see only customers they booked.
    is_master: Mapped[int] = mapped_column(Integer, default=0)
    # a suspended customer can still log in and read, but cannot place a wager
    is_active: Mapped[int] = mapped_column(Integer, default=1)
    # how deep the account may run on credit: balance is allowed down to
    # -credit_limit. 0 = prepaid only, no credit.
    credit_limit_micros: Mapped[int] = mapped_column(BigInt, default=0)
    # max stake on a single wager, micro-credits. NULL = fall back to config.
    wager_limit_micros: Mapped[int | None] = mapped_column(BigInt, nullable=True)
    # per-product switches, the green/red blocks on the admin sheet
    allow_sportsbook: Mapped[int] = mapped_column(Integer, default=1)
    allow_casino: Mapped[int] = mapped_column(Integer, default=1)
    allow_live: Mapped[int] = mapped_column(Integer, default=1)   # in-play wagering
    # the profile page: what the agent calls this player, and private notes
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str] = mapped_column(String(500), default="")
    # which agent booked this customer
    created_by: Mapped[int | None] = mapped_column(BigInt, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Settlement(Base):
    """A settled weekly figure.

    In a real book the agent and customer square up in cash outside the system;
    this records that it happened and returns the customer to their baseline so
    next week's figure starts from zero.
    """
    __tablename__ = "settlements"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInt, ForeignKey("users.id"), index=True)
    settled_by: Mapped[int] = mapped_column(BigInt, ForeignKey("users.id"))
    week_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    figure_micros: Mapped[int] = mapped_column(BigInt)   # +ve = customer up
    note: Mapped[str] = mapped_column(String(200), default="")
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BookLimits(Base):
    """Book-wide wagering limits -- one row, edited by the master agent.

    These apply to every customer unless an agent set that player a TIGHTER
    per-account wager limit; the lower number always wins. Money fields are
    micro-credits, line fields are American odds, toggles are 0/1.
    """
    __tablename__ = "book_limits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    min_straight_micros: Mapped[int] = mapped_column(BigInt, default=1_000_000)
    max_straight_micros: Mapped[int] = mapped_column(BigInt, default=500_000_000)
    max_per_offering_micros: Mapped[int] = mapped_column(BigInt, default=1_000_000_000)
    max_per_event_micros: Mapped[int] = mapped_column(BigInt, default=5_000_000_000)
    max_win_single_micros: Mapped[int] = mapped_column(BigInt, default=10_000_000_000)
    max_win_event_micros: Mapped[int] = mapped_column(BigInt, default=10_000_000_000)
    max_fav_line: Mapped[int] = mapped_column(Integer, default=-500)   # steepest favorite
    max_dog_line: Mapped[int] = mapped_column(Integer, default=400)    # longest dog, straights
    min_parlay_micros: Mapped[int] = mapped_column(BigInt, default=1_000_000)
    max_parlay_micros: Mapped[int] = mapped_column(BigInt, default=500_000_000)
    max_win_parlay_micros: Mapped[int] = mapped_column(BigInt, default=15_000_000_000)
    max_dog_line_parlay: Mapped[int] = mapped_column(Integer, default=1000)
    delay_sec: Mapped[int] = mapped_column(Integer, default=30)        # live accept delay
    cooloff_sec: Mapped[int] = mapped_column(Integer, default=0)       # min gap between wagers
    live_parlays: Mapped[int] = mapped_column(Integer, default=1)
    block_prior_start: Mapped[int] = mapped_column(Integer, default=0)
    block_halftime: Mapped[int] = mapped_column(Integer, default=0)
    include_graded: Mapped[int] = mapped_column(Integer, default=0)    # graded count vs caps
    use_risk: Mapped[int] = mapped_column(Integer, default=1)          # risk (stake) vs volume


# ---------------------------------------------------------------- ledger ----
class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(BigInt, ForeignKey("users.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(24))  # user_wallet | house | faucet
    currency: Mapped[str] = mapped_column(String(12), default="CREDIT")
    __table_args__ = (UniqueConstraint("user_id", "kind", "currency", name="uq_account"),)


class AccountBalance(Base):
    """Cache for speed. The ledger is truth; a nightly job asserts they agree."""
    __tablename__ = "account_balances"
    account_id: Mapped[int] = mapped_column(BigInt, ForeignKey("accounts.id"), primary_key=True)
    balance_micros: Mapped[int] = mapped_column(BigInt, default=0)


class LedgerTransaction(Base):
    __tablename__ = "ledger_transactions"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(32))
    ref_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ref_id: Mapped[int | None] = mapped_column(BigInt, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(BigInt, ForeignKey("ledger_transactions.id"))
    account_id: Mapped[int] = mapped_column(BigInt, ForeignKey("accounts.id"))
    amount_micros: Mapped[int] = mapped_column(BigInteger)  # signed; sums to 0 per txn
    __table_args__ = (Index("ix_entries_account", "account_id", "id"),)


# -------------------------------------------------------------- fairness ----
class SeedPair(Base):
    __tablename__ = "seed_pairs"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInt, ForeignKey("users.id"), index=True)
    server_seed: Mapped[str] = mapped_column(String(128))       # hidden until revealed
    server_seed_hash: Mapped[str] = mapped_column(String(64))
    client_seed: Mapped[str] = mapped_column(String(64))
    nonce: Mapped[int] = mapped_column(Integer, default=0)
    revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ----------------------------------------------------------------- rounds ----

class CasinoRound(Base):
    """One round of any casino game beyond Duel: dice, wheel, blackjack.

    `detail` is a JSON snapshot of everything the round used -- for blackjack
    it carries the whole hand state (including the undealt deck) while the
    hand is open, and the final table when it settles. Combined with the seed
    pair and nonce, every card and roll is reproducible by the player."""
    __tablename__ = "casino_rounds"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    game: Mapped[str] = mapped_column(String(16), index=True)   # dice | wheel | blackjack
    user_id: Mapped[int] = mapped_column(BigInt, ForeignKey("users.id"), index=True)
    seed_pair_id: Mapped[int] = mapped_column(BigInt, ForeignKey("seed_pairs.id"))
    nonce: Mapped[int] = mapped_column(Integer)
    stake_micros: Mapped[int] = mapped_column(BigInteger)
    payout_micros: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="settled")  # open | settled
    outcome: Mapped[str | None] = mapped_column(String(24), nullable=True)
    detail: Mapped[str] = mapped_column(String(4000), default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DuelRound(Base):
    """Head-to-head against the house. The odds in force are stored ON the row,
    so changing the config later can never retroactively alter what a player
    was actually offered."""
    __tablename__ = "duel_rounds"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInt, ForeignKey("users.id"), index=True)
    seed_pair_id: Mapped[int] = mapped_column(BigInt, ForeignKey("seed_pairs.id"))
    nonce: Mapped[int] = mapped_column(Integer)
    stake_micros: Mapped[int] = mapped_column(BigInteger)
    roll: Mapped[str] = mapped_column(String(16))
    house_win_prob: Mapped[str] = mapped_column(String(16))
    payout_multiplier: Mapped[str] = mapped_column(String(16))
    house_wins: Mapped[int] = mapped_column(Integer)         # 1 house, 0 player
    payout_micros: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
