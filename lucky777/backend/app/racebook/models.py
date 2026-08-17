from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..models import Base, BigInt, utcnow


class Track(Base):
    __tablename__ = "rb_tracks"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(64))


class Race(Base):
    __tablename__ = "rb_races"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(BigInt, ForeignKey("rb_tracks.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    post_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(12), default="scheduled", index=True)
    # finish order as program numbers, "4-1-6-3-..." -- written once at the off
    result: Mapped[str | None] = mapped_column(String(64), nullable=True)
    __table_args__ = (UniqueConstraint("track_id", "post_time", name="uq_race_slot"),)


class Runner(Base):
    __tablename__ = "rb_runners"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    race_id: Mapped[int] = mapped_column(BigInt, ForeignKey("rb_races.id"), index=True)
    pn: Mapped[int] = mapped_column(Integer)               # program number
    name: Mapped[str] = mapped_column(String(64))
    jockey: Mapped[str] = mapped_column(String(48))
    ml: Mapped[str] = mapped_column(String(12))            # morning line, "7/2"
    weight: Mapped[str] = mapped_column(String(8), default="L122")
    __table_args__ = (UniqueConstraint("race_id", "pn", name="uq_runner_pn"),)


class RaceBet(Base):
    """kind: win | place | show | exacta | trifecta.
    picks: program numbers, "3" or "3-5" (order matters for exotics)."""
    __tablename__ = "rb_bets"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInt, ForeignKey("users.id"), index=True)
    race_id: Mapped[int] = mapped_column(BigInt, ForeignKey("rb_races.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))
    picks: Mapped[str] = mapped_column(String(24))
    stake_micros: Mapped[int] = mapped_column(BigInteger)
    potential_micros: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(12), default="open", index=True)
    payout_micros: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
