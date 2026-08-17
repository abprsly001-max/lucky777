"""Sportsbook domain: Sport -> Competition -> Event -> Market -> Selection.

Odds are stored as decimal *text*, not floats. A price is a contractual term;
it must round-trip exactly and never pick up binary-floating-point dust.

The rule that matters most here: `selections.odds_decimal` is the CURRENT price
and moves constantly, while `bet_selections.odds_at_placement` is the price the
bet was actually struck at. Settlement reads the snapshot, never the live price.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..models import Base, BigInt, utcnow


class Sport(Base):
    __tablename__ = "sports"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    icon: Mapped[str] = mapped_column(String(8), default="")
    sort: Mapped[int] = mapped_column(Integer, default=0)


class Competition(Base):
    __tablename__ = "competitions"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    sport_id: Mapped[int] = mapped_column(BigInt, ForeignKey("sports.id"), index=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(96))
    country: Mapped[str] = mapped_column(String(48), default="")


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    provider_id: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    competition_id: Mapped[int] = mapped_column(BigInt, ForeignKey("competitions.id"), index=True)
    home: Mapped[str] = mapped_column(String(96))
    away: Mapped[str] = mapped_column(String(96))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    # scheduled | live | ended | abandoned | postponed
    status: Mapped[str] = mapped_column(String(16), default="scheduled", index=True)
    # circled game: reduced limits. The classic reason is injury doubt or a
    # suspect line -- the game stays on the board but stakes are capped.
    circled: Mapped[int] = mapped_column(Integer, default=0)
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # in-play state: "1H", "HT", "Q3", "P2", "FT"... and how far through the
    # simulated game clock we are (0..live_total_steps)
    period: Mapped[str | None] = mapped_column(String(12), nullable=True)
    live_step: Mapped[int] = mapped_column(Integer, default=0)
    # the line score: JSON [{"p": "Inn 1", "h": 2, "a": 0}, ...] built live
    period_scores: Mapped[str | None] = mapped_column(String(600), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Market(Base):
    __tablename__ = "markets"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(BigInt, ForeignKey("events.id"), index=True)
    # h2h | totals | spreads | btts | double_chance
    type: Mapped[str] = mapped_column(String(24))
    line: Mapped[str | None] = mapped_column(String(16), nullable=True)   # "2.5", "-3.5"
    name: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="open")       # open|suspended|settled|void
    __table_args__ = (UniqueConstraint("event_id", "type", "line", name="uq_market"),)


class Selection(Base):
    __tablename__ = "selections"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    market_id: Mapped[int] = mapped_column(BigInt, ForeignKey("markets.id"), index=True)
    key: Mapped[str] = mapped_column(String(24))        # home|draw|away|over|under|yes|no
    name: Mapped[str] = mapped_column(String(96))
    odds_decimal: Mapped[str] = mapped_column(String(16))   # CURRENT price, moves
    # snapshot taken at kickoff: the live model reprices from THIS baseline plus
    # the game state, never from the already-shifted current price (compounding)
    opening_odds: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open")
    # NULL | won | lost | void | push | half_won | half_lost
    result: Mapped[str | None] = mapped_column(String(16), nullable=True)


class OddsHistory(Base):
    """You must be able to prove what a price was at any moment."""
    __tablename__ = "odds_history"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    selection_id: Mapped[int] = mapped_column(BigInt, ForeignKey("selections.id"))
    odds_decimal: Mapped[str] = mapped_column(String(16))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (Index("ix_odds_hist", "selection_id", "id"),)


class Bet(Base):
    # type: single | parlay | teaser | if_win | if_action | reverse
    __tablename__ = "bets"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInt, ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(16))            # single | parlay
    stake_micros: Mapped[int] = mapped_column(BigInt)
    total_odds: Mapped[str] = mapped_column(String(24))      # product of struck leg odds
    potential_micros: Mapped[int] = mapped_column(BigInt)
    # open | won | lost | void | partial
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    # teaser tier index (0/1/2) -- which points package the ticket was sold at
    teaser_tier: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # staked with free play: the FP stake is consumed win or lose, and only
    # the WINNINGS are paid out -- in real credits
    is_free_play: Mapped[int] = mapped_column(Integer, default=0)
    payout_micros: Mapped[int | None] = mapped_column(BigInt, nullable=True)
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BetSelection(Base):
    __tablename__ = "bet_selections"
    id: Mapped[int] = mapped_column(BigInt, primary_key=True, autoincrement=True)
    bet_id: Mapped[int] = mapped_column(BigInt, ForeignKey("bets.id"), index=True)
    selection_id: Mapped[int] = mapped_column(BigInt, ForeignKey("selections.id"), index=True)
    # THE SNAPSHOT. Never recomputed, never joined from selections at settlement.
    odds_at_placement: Mapped[str] = mapped_column(String(16))
    # the market line as struck (spread/total), for closing-line analysis
    line_at_placement: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # teaser legs only: the MOVED number this leg grades against, in the
    # bettor's own terms (home/away handicap, or the over/under total)
    teased_line: Mapped[str | None] = mapped_column(String(16), nullable=True)
    result: Mapped[str | None] = mapped_column(String(16), nullable=True)
    __table_args__ = (UniqueConstraint("bet_id", "selection_id", name="uq_bet_leg"),)
