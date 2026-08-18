"""Piggy Bank Blast: a Hold & Spin coin collector.

The Vegas-floor mechanic: COIN symbols carry printed values. Land the trigger
count and the coins LOCK; you get 3 respins, every fresh coin resets them,
and filling all 15 cells pays the Grand on top. The whole feature is an
absorbing Markov chain, so the machine's return is computed exactly and the
coin values are scaled at import to hold the house's percent.
"""
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from math import comb

from ...core import fairness

CELLS = 15
TRIGGER = 6            # coins on one spin to start the feature
RESPINS = 3
TARGET_RTP = Decimal("0.92")
GRAND_MULT = Decimal("100")     # full grid pays this on top of the coins

# base-game reel: coin probability per cell + a simple line-free pay model
# (the base game pays nothing itself; ALL value is in the feature, like the
# classic coin collectors -- so the trigger math is the whole game)
P_COIN = Decimal("0.12")

# coin face values in bet units, weighted (before scaling)
COIN_VALUES = [(Decimal("0.5"), 40), (Decimal("1"), 30), (Decimal("2"), 15),
               (Decimal("3"), 8), (Decimal("5"), 4), (Decimal("10"), 2),
               (Decimal("25"), 1)]

_scale = Decimal(1)     # set by _normalize


def _mean_coin() -> Decimal:
    tot = sum(w for _, w in COIN_VALUES)
    return sum(v * w for v, w in COIN_VALUES) / tot * _scale


def _binom_p(n: int, k: int, p: Decimal) -> Decimal:
    return Decimal(comb(n, k)) * p**k * (1 - p) ** (n - k)


@lru_cache(maxsize=None)
def _feature_stats(filled: int, respins: int) -> tuple[float, float]:
    """(expected final fill, probability of full grid) from this state."""
    if filled >= CELLS:
        return (float(CELLS), 1.0)
    if respins == 0:
        return (float(filled), 0.0)
    empty = CELLS - filled
    p = P_COIN
    p0 = float(_binom_p(empty, 0, p))
    ef, pg = 0.0, 0.0
    # nothing lands: lose a respin
    sub = _feature_stats(filled, respins - 1)
    ef += p0 * sub[0]
    pg += p0 * sub[1]
    # x >= 1 land: respins reset
    for x in range(1, empty + 1):
        px = float(_binom_p(empty, x, p))
        sub = _feature_stats(filled + x, RESPINS)
        ef += px * sub[0]
        pg += px * sub[1]
    return (ef, pg)


def trigger_probability(k: int) -> Decimal:
    return _binom_p(CELLS, k, P_COIN)


def exact_rtp() -> Decimal:
    """Every coin pays its face the moment it lands (base or respin); a full
    grid pays the Grand on top. RTP = mean coin value x expected coins landed
    per spin (base + feature extras) + grand contribution."""
    coins = CELLS * P_COIN                     # base-game landings
    grand = Decimal(0)
    for k in range(TRIGGER, CELLS + 1):
        pk = trigger_probability(k)
        ef, pg = _feature_stats(k, RESPINS)
        coins += pk * (Decimal(str(ef)) - k)   # extras landed in the feature
        grand += pk * Decimal(str(pg))
    return coins * _mean_coin() + grand * GRAND_MULT * _scale


def _normalize() -> None:
    global _scale
    _scale = Decimal(1)
    base = exact_rtp()
    _scale = (TARGET_RTP / base).quantize(Decimal("0.0001"),
                                          rounding="ROUND_DOWN")
    _feature_stats.cache_clear()


_normalize()


def scaled_coin_values() -> list[tuple[Decimal, int]]:
    return [((v * _scale).quantize(Decimal("0.01"), rounding="ROUND_DOWN"), w)
            for v, w in COIN_VALUES]


@dataclass(frozen=True)
class BaseSpin:
    coins: dict[int, str]      # cell -> coin value (bet units, as str)
    triggered: bool


def _draw_coin_value(f: float) -> Decimal:
    vals = scaled_coin_values()
    tot = sum(w for _, w in vals)
    target = f * tot
    acc = 0
    for v, w in vals:
        acc += w
        if target < acc:
            return v
    return vals[-1][0]


def base_spin(server: str, client: str, nonce: int) -> BaseSpin:
    fs = fairness.floats(server, client, nonce, CELLS * 2)
    coins: dict[int, str] = {}
    for cell in range(CELLS):
        if Decimal(str(fs[cell])) < P_COIN:
            coins[cell] = str(_draw_coin_value(fs[CELLS + cell]))
    return BaseSpin(coins=coins, triggered=len(coins) >= TRIGGER)


def respin(server: str, client: str, nonce: int,
           locked_cells: list[int]) -> dict[int, str]:
    """One respin over the empty cells; returns newly landed coins."""
    fs = fairness.floats(server, client, nonce, CELLS * 2)
    new: dict[int, str] = {}
    for cell in range(CELLS):
        if cell in locked_cells:
            continue
        if Decimal(str(fs[cell])) < P_COIN:
            new[cell] = str(_draw_coin_value(fs[CELLS + cell]))
    return new
