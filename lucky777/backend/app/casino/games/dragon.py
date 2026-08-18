"""Golden Dragon Inferno: a Hold & Win with a six-tier jackpot ladder.

The BetSoft-floor mechanic: fortune COINS carry printed values -- most are
cash, but some are jackpot coins that pay a fixed multiple of the bet the
moment they land (MINI 15x / MINOR 30x / MAJOR 40x / MAXI 100x / SUPER 400x).
Land the trigger count and the coins LOCK; 3 respins, every fresh coin resets
them, and filling all 15 cells pays the 2000x GRAND on top. The feature is an
absorbing Markov chain, so the return is exact: jackpot multiples stay FIXED
and the cash faces are scaled at import so the house holds its percent.
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

# the ladder -- fixed bet-multiples, never scaled
JACKPOTS: dict[str, Decimal] = {
    "mini": Decimal("15"), "minor": Decimal("30"), "major": Decimal("40"),
    "maxi": Decimal("100"), "super": Decimal("400"),
}
GRAND_MULT = Decimal("2000")    # full 15-cell grid pays this on top

P_COIN = Decimal("0.12")        # coin probability per cell on the base spin
P_RESPIN = Decimal("0.05")      # stingier during the feature: Grand stays rare

# probability that a landed coin is each jackpot tier (per coin, absolute)
JP_PROB: dict[str, Decimal] = {
    "mini": Decimal("0.0025"), "minor": Decimal("0.0010"),
    "major": Decimal("0.0006"), "maxi": Decimal("0.00015"),
    "super": Decimal("0.00002"),
}

# cash coin face values in bet units, weighted (before scaling)
COIN_VALUES = [(Decimal("0.5"), 40), (Decimal("1"), 30), (Decimal("2"), 15),
               (Decimal("3"), 8), (Decimal("5"), 4), (Decimal("10"), 2),
               (Decimal("25"), 1)]

_scale = Decimal(1)     # set by _normalize; applies to CASH faces only


def _jp_mean() -> Decimal:
    return sum(JP_PROB[t] * JACKPOTS[t] for t in JACKPOTS)


def _cash_mean_unscaled() -> Decimal:
    tot = sum(w for _, w in COIN_VALUES)
    return sum(v * w for v, w in COIN_VALUES) / tot


def _mean_coin() -> Decimal:
    p_cash = Decimal(1) - sum(JP_PROB.values())
    return _jp_mean() + p_cash * _cash_mean_unscaled() * _scale


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
    p = P_RESPIN
    p0 = float(_binom_p(empty, 0, p))
    ef, pg = 0.0, 0.0
    sub = _feature_stats(filled, respins - 1)
    ef += p0 * sub[0]
    pg += p0 * sub[1]
    for x in range(1, empty + 1):
        px = float(_binom_p(empty, x, P_RESPIN))
        sub = _feature_stats(filled + x, RESPINS)
        ef += px * sub[0]
        pg += px * sub[1]
    return (ef, pg)


def trigger_probability(k: int) -> Decimal:
    return _binom_p(CELLS, k, P_COIN)


def _coins_and_grand() -> tuple[Decimal, Decimal]:
    """(expected coins landed per spin, grand probability per spin)."""
    coins = CELLS * P_COIN
    grand = Decimal(0)
    for k in range(TRIGGER, CELLS + 1):
        pk = trigger_probability(k)
        ef, pg = _feature_stats(k, RESPINS)
        coins += pk * (Decimal(str(ef)) - k)
        grand += pk * Decimal(str(pg))
    return coins, grand


def exact_rtp() -> Decimal:
    coins, grand = _coins_and_grand()
    return coins * _mean_coin() + grand * GRAND_MULT


def _normalize() -> None:
    """Solve the cash-face scale so RTP == TARGET with the ladder FIXED."""
    global _scale
    coins, grand = _coins_and_grand()
    p_cash = Decimal(1) - sum(JP_PROB.values())
    fixed = coins * _jp_mean() + grand * GRAND_MULT
    room = TARGET_RTP - fixed
    if room <= 0:                      # ladder alone would beat the target
        raise RuntimeError("jackpot ladder exceeds target RTP")
    _scale = (room / (coins * p_cash * _cash_mean_unscaled())).quantize(
        Decimal("0.0001"), rounding="ROUND_DOWN")


_normalize()


def scaled_coin_values() -> list[tuple[Decimal, int]]:
    return [((v * _scale).quantize(Decimal("0.01"), rounding="ROUND_DOWN"), w)
            for v, w in COIN_VALUES]


def coin_multiplier(token: str) -> Decimal:
    """Bet-multiple a landed coin pays: jackpot tier name or a cash face."""
    if token in JACKPOTS:
        return JACKPOTS[token]
    return Decimal(token)


def _draw_coin(f: float) -> str:
    """One landed coin: jackpot tier name, or a cash face as a string."""
    x = Decimal(str(f))
    acc = Decimal(0)
    for t in ("mini", "minor", "major", "maxi", "super"):
        acc += JP_PROB[t]
        if x < acc:
            return t
    # cash: map the remaining mass onto the weighted faces
    vals = scaled_coin_values()
    tot = sum(w for _, w in vals)
    rem = (x - acc) / (Decimal(1) - acc)     # renormalized to [0, 1)
    target = rem * tot
    run = 0
    for v, w in vals:
        run += w
        if target < run:
            return str(v)
    return str(vals[-1][0])


@dataclass(frozen=True)
class BaseSpin:
    coins: dict[int, str]      # cell -> tier name or cash face (bet units)
    triggered: bool


def base_spin(server: str, client: str, nonce: int) -> BaseSpin:
    fs = fairness.floats(server, client, nonce, CELLS * 2)
    coins: dict[int, str] = {}
    for cell in range(CELLS):
        if Decimal(str(fs[cell])) < P_COIN:
            coins[cell] = _draw_coin(fs[CELLS + cell])
    return BaseSpin(coins=coins, triggered=len(coins) >= TRIGGER)


def respin(server: str, client: str, nonce: int,
           locked_cells: list[int]) -> dict[int, str]:
    """One respin over the empty cells; returns newly landed coins."""
    fs = fairness.floats(server, client, nonce, CELLS * 2)
    new: dict[int, str] = {}
    for cell in range(CELLS):
        if cell in locked_cells:
            continue
        if Decimal(str(fs[cell])) < P_RESPIN:
            new[cell] = _draw_coin(fs[CELLS + cell])
    return new


# ------------------------------------------------------------- bonus buy ----
def _p_trigger() -> Decimal:
    return sum(trigger_probability(k) for k in range(TRIGGER, CELLS + 1))


def bonus_ev_per_stake() -> Decimal:
    """Expected payout (in bet units) of a GUARANTEED-trigger spin."""
    ptrig = _p_trigger()
    ev = Decimal(0)
    for k in range(TRIGGER, CELLS + 1):
        pk = trigger_probability(k) / ptrig
        ef, pg = _feature_stats(k, RESPINS)
        ev += pk * (Decimal(str(ef)) * _mean_coin()
                    + Decimal(str(pg)) * GRAND_MULT)
    return ev


def buy_cost_mult() -> Decimal:
    """Bonus Buy price as a bet-multiple; house keeps its percent on it."""
    return (bonus_ev_per_stake() / TARGET_RTP).quantize(
        Decimal("1"), rounding="ROUND_UP")


def buy_spin(server: str, client: str, nonce: int) -> BaseSpin:
    """A base spin conditioned on triggering: draw the coin count from the
    conditional distribution, place the coins by partial shuffle, then draw
    each face. Exactly the distribution of a natural trigger."""
    fs = fairness.floats(server, client, nonce, 1 + CELLS + CELLS)
    ptrig = _p_trigger()
    target = Decimal(str(fs[0])) * ptrig
    acc = Decimal(0)
    k = CELLS
    for kk in range(TRIGGER, CELLS + 1):
        acc += trigger_probability(kk)
        if target < acc:
            k = kk
            break
    cells = list(range(CELLS))
    for i in range(k):                       # partial Fisher-Yates
        j = i + int(Decimal(str(fs[1 + i])) * (CELLS - i))
        j = min(j, CELLS - 1)
        cells[i], cells[j] = cells[j], cells[i]
    coins = {cells[i]: _draw_coin(fs[1 + CELLS + i]) for i in range(k)}
    return BaseSpin(coins=coins, triggered=True)
