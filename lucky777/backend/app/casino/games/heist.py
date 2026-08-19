"""Grand Heist: the high-volatility flagship.

The mechanic class the big studios ride: a lean, top-heavy base game and a
bonus where every WILD that lands LOCKS in place for the rest of the feature
carrying a printed multiplier. A line win through sticky wilds is multiplied
by the SUM of their multipliers — stack a 50x and a 25x on one line and the
board goes nuclear. Bonus wins cap at MAX_WIN_MULT x stake.

Two ways in: land 3 scatters, or buy the bonus. The SUPER buy opens with a
high-multiplier wild already locked in the middle of the board.

MATH. The base game is exactly solved (same enumeration as videoslots.py).
The bonus can't be closed-form — sticky state compounds across spins — so it
is calibrated by a seeded Monte Carlo and frozen into _SCALE below. The
build fails if a fresh seeded simulation drifts out of band
(tests/test_heist.py), so the 8-point hold is enforced, not hoped for.
"""
from dataclasses import dataclass
from decimal import Decimal
from math import comb

from ...core import fairness
from .videoslots import CELLS, LINES, REELS, ROWS, SCATTER, WILD

NAME = "Grand Heist"
TARGET_RTP = Decimal("0.92")          # house keeps 8

# (key, weight, {count: raw line-bet pay}) — scaled by _SCALE at import
SYMBOLS: list[tuple[str, int, dict | None]] = [
    (WILD,     2,  {3: 50, 4: 250, 5: 1500}),
    (SCATTER,  2,  None),
    ("crown",  4,  {3: 30, 4: 120, 5: 600}),
    ("diamond", 6, {3: 16, 4: 60, 5: 200}),
    ("coin",   8,  {3: 10, 4: 30, 5: 100}),
    ("ring",   9,  {3: 6, 4: 18, 5: 60}),
    ("A",     12,  {3: 3, 4: 9, 5: 28}),
    ("K",     13,  {3: 2, 4: 7, 5: 22}),
    ("Q",     14,  {3: 2, 4: 6, 5: 16}),
    ("J",     15,  {3: 1, 4: 5, 5: 12}),
]

TRIGGER = 3            # scatters to open the vault
BONUS_SPINS = 6
MAX_WIN_MULT = Decimal("5000")        # x stake, per bonus

# base-game wilds carry a ONE-SPIN multiplier — the bonus makes them stick
BASE_MULT: list[tuple[int, int]] = [(2, 60), (3, 30), (5, 10)]
# sticky wild multiplier faces in the bonus, weighted
MULT_TABLE: list[tuple[int, int]] = [
    (2, 44), (3, 24), (5, 14), (10, 10), (25, 5), (50, 2), (100, 1)]
# the SUPER buy's opening wild draws from the hot end only
SUPER_TABLE: list[tuple[int, int]] = [(10, 50), (25, 30), (50, 15), (100, 5)]
SUPER_CELL = 7          # reel 2, middle row

# ---- Frozen calibration (2026-08-19, see tests/test_heist.py) -------------
# base game EV per line-bet (400k-round seeded MC, seed "heist-base-cal"),
# bonus EV per trigger in stake units (120k rounds, seed "heist-cal"), and
# the SUPER-start EV (60k rounds, seed "heist-super"). p_trigger is exact.
# The build fails if a fresh seeded sim drifts out of band.
_RAW_BASE_EV = Decimal("0.319055375")
_RAW_BONUS_EV = Decimal("43.505752")
_RAW_SUPER_EV = Decimal("237.495778")


# ------------------------------------------------------------------ helpers --
def _weights() -> tuple[list[str], list[int], int]:
    keys = [k for k, _, _ in SYMBOLS]
    ws = [w for _, w, _ in SYMBOLS]
    return keys, ws, sum(ws)


def _draw(f: float) -> str:
    keys, ws, total = _weights()
    target = f * total
    acc = 0
    for k, w in zip(keys, ws):
        acc += w
        if target < acc:
            return k
    return keys[-1]


def _draw_mult(f: float, table: list[tuple[int, int]]) -> int:
    total = sum(w for _, w in table)
    target = f * total
    acc = 0
    for v, w in table:
        acc += w
        if target < acc:
            return v
    return table[-1][0]


def _raw_pays() -> dict[str, dict]:
    return {k: p for k, _, p in SYMBOLS if p}


def _line_hit(line_syms: list[str]) -> tuple[str | None, int, Decimal]:
    """(symbol, run length, raw pay) of the best left-to-right hit."""
    best: tuple[str | None, int, Decimal] = (None, 0, Decimal(0))
    for tgt, table in _raw_pays().items():
        n = 0
        for s in line_syms:
            if s == tgt or (s == WILD and tgt != SCATTER):
                n += 1
            else:
                break
        if n >= 3:
            pay = Decimal(str(table.get(n, 0)))
            if pay > best[2]:
                best = (tgt, n, pay)
    return best


def p_trigger() -> Decimal:
    _, ws, total = _weights()
    p = Decimal(dict((k, w) for k, w, _ in SYMBOLS)[SCATTER]) / total
    out = Decimal(0)
    for k in range(TRIGGER, CELLS + 1):
        out += Decimal(comb(CELLS, k)) * p**k * (1 - p) ** (CELLS - k)
    return out


def _eval_raw(grid: list[list[str]], mults: dict[int, int]) -> Decimal:
    total = Decimal(0)
    for shape in LINES:
        syms = [grid[reel][shape[reel]] for reel in range(REELS)]
        _, n, pay = _line_hit(syms)
        if pay:
            m = sum(mults.get(reel * ROWS + shape[reel], 0) for reel in range(n))
            total += pay * max(1, m)
    return total


def base_mc(rounds: int, seed: str = "heist-base-cal") -> Decimal:
    """Seeded MC: mean BASE spin payout per line-bet, raw. Base wilds carry
    a one-spin multiplier, so this can't be enumerated in closed form."""
    import random as _r
    rng = _r.Random(seed)
    total_pay = Decimal(0)
    for _ in range(rounds):
        cells = [_draw(rng.random()) for _ in range(CELLS)]
        mults = {i: _draw_mult(rng.random(), BASE_MULT)
                 for i, c in enumerate(cells) if c == WILD}
        grid = [[cells[r * ROWS + row] for row in range(ROWS)]
                for r in range(REELS)]
        total_pay += _eval_raw(grid, mults)
    return total_pay / len(LINES) / rounds


def bonus_mc(rounds: int, seed: str = "heist-cal",
             super_start: bool = False) -> Decimal:
    """Seeded MC: mean bonus payout per trigger, in STAKE units, raw.
    Deterministic per seed — calibration and the build-failing RTP test."""
    import random as _r
    rng = _r.Random(seed)
    total_pay = Decimal(0)
    for _ in range(rounds):
        stickies: dict[int, int] = (
            {SUPER_CELL: _draw_mult(rng.random(), SUPER_TABLE)}
            if super_start else {})
        for _spin in range(BONUS_SPINS):
            cells = [_draw(rng.random()) for _ in range(CELLS)]
            for idx in range(CELLS):
                if idx in stickies:
                    cells[idx] = WILD
                elif cells[idx] == WILD:
                    stickies[idx] = _draw_mult(rng.random(), MULT_TABLE)
            grid = [[cells[r * ROWS + row] for row in range(ROWS)]
                    for r in range(REELS)]
            total_pay += _eval_raw(grid, stickies)
    # line-bet units -> stake units (20 lines)
    return total_pay / len(LINES) / rounds


_SCALE = (TARGET_RTP / (_RAW_BASE_EV + p_trigger() * _RAW_BONUS_EV)
          ).quantize(Decimal("0.000001"))


def scaled_pays() -> dict[str, dict[int, Decimal]]:
    return {k: {n: (Decimal(str(v)) * _SCALE).quantize(Decimal("0.0001"))
                for n, v in p.items()} for k, _, p in SYMBOLS if p}


def bonus_ev_stake_units() -> Decimal:
    """Expected bonus payout per trigger, scaled, in stake units."""
    return _RAW_BONUS_EV * _SCALE


def buy_cost_mult(super_buy: bool = False) -> int:
    """Bonus Buy price in bets: EV / target return, rounded UP for the house.
    The SUPER buy's premium is the opening wild's expected extra, priced off
    the frozen super-start calibration."""
    ev = _RAW_BONUS_EV if not super_buy else _RAW_SUPER_EV
    cost = ev * _SCALE / TARGET_RTP
    return int(cost.to_integral_value(rounding="ROUND_CEILING"))


# ------------------------------------------------------------------- spins --
@dataclass(frozen=True)
class HeistSpin:
    grid: list[list[str]]
    line_wins: list[dict]           # {line, symbol, count, pay, mult}
    scatters: int
    total_pay: Decimal              # line-bet units, scaled
    triggered: bool
    new_stickies: dict[int, int]
    stickies: dict[int, int]


def _eval_lines(grid: list[list[str]],
                stickies: dict[int, int]) -> tuple[list[dict], Decimal]:
    pays = scaled_pays()
    wins: list[dict] = []
    total = Decimal(0)
    for li, shape in enumerate(LINES):
        syms = [grid[reel][shape[reel]] for reel in range(REELS)]
        best: tuple[str | None, int, Decimal] = (None, 0, Decimal(0))
        for tgt, table in pays.items():
            n = 0
            for s in syms:
                if s == tgt or (s == WILD and tgt != SCATTER):
                    n += 1
                else:
                    break
            if n >= 3 and table.get(n, Decimal(0)) > best[2]:
                best = (tgt, n, table[n])
        if best[2] > 0:
            mult = sum(stickies.get(reel * ROWS + shape[reel], 0)
                       for reel in range(best[1]))
            pay = best[2] * max(1, mult)
            wins.append({"line": li, "symbol": best[0], "count": best[1],
                         "pay": str(pay), "mult": max(1, mult)})
            total += pay
    return wins, total


def spin(server: str, client: str, nonce: int,
         stickies: dict[int, int] | None = None,
         bonus: bool = False) -> HeistSpin:
    """One spin. Base game: stickies empty, scatters can trigger. Bonus:
    sticky wilds are pinned into the grid and fresh wilds join them with a
    multiplier drawn from the fairness stream."""
    st = dict(stickies or {})
    fs = fairness.floats(server, client, nonce, CELLS * 2)
    cells = [_draw(f) for f in fs[:CELLS]]
    new: dict[int, int] = {}
    mi = CELLS
    if bonus:
        for idx in range(CELLS):
            if idx in st:
                cells[idx] = WILD
            elif cells[idx] == WILD:
                new[idx] = _draw_mult(fs[mi], MULT_TABLE)
                mi += 1
        st.update(new)
        mults = st
    else:
        # base game: every wild carries a one-spin multiplier
        mults = {}
        for idx in range(CELLS):
            if cells[idx] == WILD:
                mults[idx] = _draw_mult(fs[mi], BASE_MULT)
                mi += 1
    grid = [[cells[r * ROWS + row] for row in range(ROWS)] for r in range(REELS)]
    wins, total = _eval_lines(grid, mults)
    scatters = cells.count(SCATTER)
    return HeistSpin(grid=grid, line_wins=wins, scatters=scatters,
                     total_pay=total,
                     triggered=not bonus and scatters >= TRIGGER,
                     new_stickies=new if bonus else mults, stickies=st)


def super_opening_wild(server: str, client: str, nonce: int) -> int:
    """The SUPER buy's pre-locked multiplier, drawn from the hot table."""
    f = fairness.floats(server, client, nonce, 1)[0]
    return _draw_mult(f, SUPER_TABLE)
