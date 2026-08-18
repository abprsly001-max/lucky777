"""Sugar Blast: a scatter-pays tumble slot (the Sweet Bonanza mechanic).

6x5 grid, no paylines: 8 or more of a symbol ANYWHERE pays. Winning symbols
explode, the columns tumble down, fresh symbols fall in, and the chain keeps
going while there are wins. 4+ lollipop scatters award 10 free spins where
multiplier BOMBS land, stick for the whole spin, and their values SUM to
multiply the spin's total win. Buy Bonus goes straight to the free spins.

House math: pays are linear in a single scale factor, so the return is
calibrated offline by a 20M+ spin vectorized simulation of this exact
process (scripts/calibrate_tumble.py) and frozen as _SCALE below. The
seeded regression test replays the real engine to keep it honest.
"""
from dataclasses import dataclass, field
from decimal import Decimal

from ...core import fairness

COLS, ROWS = 6, 5
CELLS = COLS * ROWS
MIN_MATCH = 8
FREE_SPINS = 10
MAX_WIN_MULT = Decimal("5000")          # round cap, like the real ones
TARGET_RTP = Decimal("0.918")           # a hair under 8% for sim margin

P_SCAT = Decimal("0.021")               # scatter probability per cell
P_BOMB = Decimal("0.05")                # bomb probability per cell, FS only

# paying symbols, weight within the paying mass, pays for 8-9 / 10-11 / 12+
SYMBOLS: list[tuple[str, int, tuple[str, str, str]]] = [
    ("banana", 21, ("0.8", "1.6", "4")),
    ("grape",  19, ("1", "2", "5")),
    ("melon",  17, ("1.2", "2.4", "6")),
    ("plum",   15, ("1.5", "3", "8")),
    ("apple",  13, ("2", "4", "10")),
    ("blue",   11, ("3", "6", "15")),
    ("green",   9, ("4", "8", "20")),
    ("purple",  7, ("5", "10", "25")),
    ("heart",   5, ("10", "25", "50")),
]
_W_TOTAL = sum(w for _, w, _ in SYMBOLS)

SCATTER_PAYS = {4: Decimal("3"), 5: Decimal("5"), 6: Decimal("100")}  # 6 = 6+

BOMB_VALUES: list[tuple[str, Decimal]] = [
    ("2", Decimal("50")), ("3", Decimal("25")), ("4", Decimal("12")),
    ("5", Decimal("8")), ("6", Decimal("5")), ("8", Decimal("4")),
    ("10", Decimal("3")), ("12", Decimal("2")), ("15", Decimal("2")),
    ("20", Decimal("1.5")), ("25", Decimal("1")), ("50", Decimal("0.5")),
    ("100", Decimal("0.2")),
]
_BW_TOTAL = sum(w for _, w in BOMB_VALUES)

# frozen by scripts/calibrate_tumble.py (seed 20260818, 20M base spins,
# 10M free spins, 2M conditional-trigger spins):
#   P(trigger) = 0.00344479 (1 in 290)     E[base chain]@1 = 0.654031
#   E[free spin]@1 = 3.888841              E[chain|trig]@1 = 0.253654
#   RTP@1 = 0.802214  ->  scale = 0.918 / 0.802214
_SCALE = Decimal("1.1443")
BUY_COST_MULT = Decimal("54")           # EV 49.5x / 0.918, rounded up

MAX_STEPS = 20                          # chain safety valve; never hit


def sym_pay(sym: str, count: int) -> Decimal:
    """Scaled pay (bet units) for `count` of `sym`; 0 below the minimum."""
    if count < MIN_MATCH:
        return Decimal(0)
    for s, _, tiers in SYMBOLS:
        if s == sym:
            t = tiers[2] if count >= 12 else tiers[1] if count >= 10 else tiers[0]
            return (Decimal(t) * _SCALE).quantize(Decimal("0.0001"))
    return Decimal(0)


def scatter_pay(k: int) -> Decimal:
    if k < 4:
        return Decimal(0)
    tier = SCATTER_PAYS[6] if k >= 6 else SCATTER_PAYS[k]
    return (tier * _SCALE).quantize(Decimal("0.0001"))


def _pick_paying(g: Decimal) -> str:
    target = g * _W_TOTAL
    acc = 0
    for s, w, _ in SYMBOLS:
        acc += w
        if target < acc:
            return s
    return SYMBOLS[-1][0]


def _draw_base(f: float) -> str:
    """One base-game cell from a single float: scatter, else a paying symbol."""
    x = Decimal(str(f))
    if x < P_SCAT:
        return "scatter"
    return _pick_paying((x - P_SCAT) / (Decimal(1) - P_SCAT))


def _draw_fs(f: float) -> str:
    """One free-spin cell: bomb (with value), else the base distribution."""
    x = Decimal(str(f))
    if x < P_BOMB:
        g = x / P_BOMB
        target = g * _BW_TOTAL
        acc = Decimal(0)
        for v, w in BOMB_VALUES:
            acc += w
            if target < acc:
                return f"bomb:{v}"
        return f"bomb:{BOMB_VALUES[-1][0]}"
    return _draw_base(float((x - P_BOMB) / (Decimal(1) - P_BOMB)))


class _Pool:
    """Sequential float feed off the provably-fair stream."""

    def __init__(self, server: str, client: str, nonce: int, n: int):
        self._fs = fairness.floats(server, client, nonce, n)
        self._i = 0

    def take(self) -> float:
        if self._i >= len(self._fs):
            return 0.999999      # exhausted (never in practice): inert symbol
        f = self._fs[self._i]
        self._i += 1
        return f


@dataclass
class TumbleStep:
    grid: list[str]                      # 30 symbols AFTER this step's refill
    wins: list[dict] = field(default_factory=list)   # wins found BEFORE it


@dataclass
class TumbleResult:
    grids: list[list[str]]               # grid states: initial, then per step
    steps: list[list[dict]]              # steps[i] = wins found on grids[i]
    total: Decimal                       # chain pay, bet units (scaled)
    scatters: int                        # on the initial grid only
    bomb_sum: Decimal                    # FS only: sum of bomb values landed
    triggered: bool


def _tumble(pool: _Pool, draw, first_grid: list[str] | None = None) -> TumbleResult:
    grid = first_grid or [draw(pool.take()) for _ in range(CELLS)]
    scatters = sum(1 for s in grid if s == "scatter")
    bomb_sum = sum((Decimal(s.split(":")[1]) for s in grid if s.startswith("bomb:")),
                   Decimal(0))
    grids = [grid[:]]
    steps: list[list[dict]] = []
    total = Decimal(0)

    for _ in range(MAX_STEPS):
        counts: dict[str, int] = {}
        for s in grid:
            if s != "scatter" and not s.startswith("bomb:"):
                counts[s] = counts.get(s, 0) + 1
        wins = [{"sym": s, "count": c, "pay": str(sym_pay(s, c))}
                for s, c in counts.items() if c >= MIN_MATCH]
        if not wins:
            break
        steps.append(wins)
        total += sum(Decimal(w["pay"]) for w in wins)
        gone = {w["sym"] for w in wins}
        # columns tumble: survivors sink, fresh symbols fall in on top
        new_grid: list[str] = []
        for c in range(COLS):
            col = [grid[c * ROWS + r] for r in range(ROWS)]
            keep = [s for s in col if s not in gone]
            fresh = [draw(pool.take()) for _ in range(ROWS - len(keep))]
            for s in fresh:
                if s.startswith("bomb:"):
                    bomb_sum += Decimal(s.split(":")[1])
            new_grid.extend(fresh + keep)
        grid = new_grid
        grids.append(grid[:])

    return TumbleResult(grids=grids, steps=steps, total=total,
                        scatters=scatters, bomb_sum=bomb_sum,
                        triggered=scatters >= 4)


def base_spin(server: str, client: str, nonce: int) -> TumbleResult:
    pool = _Pool(server, client, nonce, CELLS * (MAX_STEPS + 1))
    return _tumble(pool, _draw_base)


def free_spin(server: str, client: str, nonce: int) -> TumbleResult:
    """One free spin; the caller applies bomb_sum as the win multiplier."""
    pool = _Pool(server, client, nonce, CELLS * (MAX_STEPS + 1))
    return _tumble(pool, _draw_fs)


def fs_win(r: TumbleResult) -> Decimal:
    """A free spin's final pay: chain total times the summed bombs, if any."""
    if r.total <= 0:
        return Decimal(0)
    return r.total * (r.bomb_sum if r.bomb_sum > 0 else Decimal(1))


def buy_spin(server: str, client: str, nonce: int) -> TumbleResult:
    """A base spin conditioned on triggering: scatter count drawn from the
    conditional binomial, scatters placed by partial shuffle, the rest filled
    from the paying distribution -- then the chain runs as normal."""
    from math import comb
    pool = _Pool(server, client, nonce, CELLS * (MAX_STEPS + 2))

    def binom(k: int) -> Decimal:
        return (Decimal(comb(CELLS, k)) * P_SCAT ** k
                * (Decimal(1) - P_SCAT) ** (CELLS - k))

    ptrig = sum(binom(k) for k in range(4, CELLS + 1))
    target = Decimal(str(pool.take())) * ptrig
    acc = Decimal(0)
    k = 4
    for kk in range(4, CELLS + 1):
        acc += binom(kk)
        if target < acc:
            k = kk
            break
    cells = list(range(CELLS))
    for i in range(k):
        j = i + int(Decimal(str(pool.take())) * (CELLS - i))
        j = min(j, CELLS - 1)
        cells[i], cells[j] = cells[j], cells[i]
    scat_at = set(cells[:k])
    grid = ["scatter" if i in scat_at else _pick_paying(Decimal(str(pool.take())))
            for i in range(CELLS)]
    return _tumble(pool, _draw_base, first_grid=grid)


def trigger_probability() -> Decimal:
    from math import comb
    return sum((Decimal(comb(CELLS, k)) * P_SCAT ** k
                * (Decimal(1) - P_SCAT) ** (CELLS - k))
               for k in range(4, CELLS + 1))
