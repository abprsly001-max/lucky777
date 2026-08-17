"""Racebook pricing and grading -- pure arithmetic, openly stated.

A real racebook settles at track (parimutuel) prices. A play-money book has no
pools, so payouts here derive from the MORNING LINE by fixed, published
fractions -- the formulas below are printed on the Rules page, not hidden:

  Win     pays the morning line.
  Place   pays 1 + (win-1)/4      (a quarter of the win odds)
  Show    pays 1 + (win-1)/8      (an eighth)
  Exacta  pays winA x winB / 2, floor 1.10
  Trifecta pays winA x winB x winC / 4, floor 1.20

Every ticket's payout is capped by the max-payout-per-race limit at placement,
exactly like the "Max limit payout by race" line on a real racebook card.
"""
from decimal import Decimal

from ..core.money import payout_micros

PICKS_REQUIRED = {"win": 1, "place": 1, "show": 1, "exacta": 2, "trifecta": 3}


def ml_decimal(ml: str) -> Decimal:
    """'7/2' -> 4.5 total-return decimal odds."""
    num, den = ml.split("/")
    return Decimal(1) + Decimal(num) / Decimal(den)


def multiplier(kind: str, mls: list[str]) -> Decimal:
    decs = [ml_decimal(m) for m in mls]
    if kind == "win":
        return decs[0]
    if kind == "place":
        return Decimal(1) + (decs[0] - 1) / 4
    if kind == "show":
        return Decimal(1) + (decs[0] - 1) / 8
    if kind == "exacta":
        return max(Decimal("1.10"), decs[0] * decs[1] / 2)
    if kind == "trifecta":
        return max(Decimal("1.20"), decs[0] * decs[1] * decs[2] / 4)
    raise ValueError(f"unknown bet kind {kind!r}")


def potential(kind: str, mls: list[str], stake_micros: int,
              max_payout_micros: int) -> int:
    raw = payout_micros(stake_micros, multiplier(kind, mls))
    # the cap limits the WIN, never the stake coming back
    return min(raw, stake_micros + max_payout_micros)


def grade(kind: str, picks: list[int], finish: list[int]) -> bool:
    """Did the ticket hit? `finish` is program numbers in finishing order."""
    if kind == "win":
        return finish[0] == picks[0]
    if kind == "place":
        return picks[0] in finish[:2]
    if kind == "show":
        return picks[0] in finish[:3]
    if kind == "exacta":
        return finish[:2] == picks
    if kind == "trifecta":
        return finish[:3] == picks
    raise ValueError(f"unknown bet kind {kind!r}")
