"""Five-reel video slots: 20 paylines, wilds, scatters, free-spin bonuses.

The whole machine is exactly solvable: every visible cell is an independent
weighted draw, so the expected value of a payline is a closed computation over
symbol tuples, and the free-spin bonus is a binomial trigger on scatter count.
At import, every machine's paytable is scaled so total RTP lands on its
target -- the house percent is enforced by arithmetic, not by hope.
"""
from dataclasses import dataclass
from decimal import Decimal
from itertools import product
from math import comb

from ...core import fairness

ROWS, REELS, CELLS = 3, 5, 15
TARGET_RTP = Decimal("0.92")   # house keeps 8

# the 20 classic payline shapes: row index per reel
LINES: list[tuple[int, ...]] = [
    (1, 1, 1, 1, 1), (0, 0, 0, 0, 0), (2, 2, 2, 2, 2), (0, 1, 2, 1, 0),
    (2, 1, 0, 1, 2), (0, 0, 1, 2, 2), (2, 2, 1, 0, 0), (1, 0, 1, 2, 1),
    (1, 2, 1, 0, 1), (0, 1, 1, 1, 0), (2, 1, 1, 1, 2), (1, 0, 0, 0, 1),
    (1, 2, 2, 2, 1), (0, 1, 0, 1, 0), (2, 1, 2, 1, 2), (1, 1, 0, 1, 1),
    (1, 1, 2, 1, 1), (0, 2, 0, 2, 0), (2, 0, 2, 0, 2), (0, 2, 2, 2, 0),
]

WILD, SCATTER = "wild", "scatter"

# machine: symbols as (key, weight, {count: line-bet pay}) -- pays are the
# RAW shape; normalization rescales them to the target return.
VIDEO_SLOTS: dict[str, dict] = {
    "golden7s": {
        "name": "Golden 7s Deluxe",
        "tagline": "Vegas classic. A rising multiplier climbs every spin.",
        "free_spins": {"trigger": 3, "count": 10, "mult": 6,
                       "profile": [2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
                       "feature": "ladder", "label": "Rising Multiplier"},
        "symbols": [
            (WILD,    2,  {3: 40, 4: 200, 5: 1000}),
            (SCATTER, 3,  None),
            ("seven", 4,  {3: 30, 4: 120, 5: 500}),
            ("bar3",  5,  {3: 20, 4: 60, 5: 200}),
            ("bell",  7,  {3: 12, 4: 40, 5: 120}),
            ("cherry", 9, {3: 8, 4: 24, 5: 80}),
            ("A",     11, {3: 4, 4: 12, 5: 40}),
            ("K",     12, {3: 3, 4: 10, 5: 30}),
            ("Q",     13, {3: 2, 4: 8, 5: 20}),
            ("J",     14, {3: 2, 4: 6, 5: 16}),
        ],
    },
    "aztec": {
        "name": "Aztec Treasure",
        "tagline": "Find the pyramid. Twelve steady bonus spins at 3x.",
        "free_spins": {"trigger": 3, "count": 12, "mult": 3,
                       "profile": [3] * 12,
                       "feature": "flat", "label": "Idol Hunt · 12 spins"},
        "symbols": [
            (WILD,    2,  {3: 50, 4: 250, 5: 1500}),
            (SCATTER, 2,  None),
            ("mask",  4,  {3: 35, 4: 150, 5: 600}),
            ("jaguar", 5, {3: 25, 4: 80, 5: 250}),
            ("snake", 7,  {3: 15, 4: 50, 5: 150}),
            ("idol",  8,  {3: 10, 4: 30, 5: 100}),
            ("A",     11, {3: 4, 4: 14, 5: 45}),
            ("K",     12, {3: 3, 4: 10, 5: 35}),
            ("Q",     14, {3: 2, 4: 8, 5: 25}),
            ("J",     15, {3: 2, 4: 6, 5: 18}),
        ],
    },
    "reaper": {
        "name": "Reaper's Riches",
        "tagline": "The scythe turns the middle reel fully wild all bonus.",
        "free_spins": {"trigger": 3, "count": 8, "mult": 3,
                       "profile": [3] * 8, "wild_reels": [2],
                       "feature": "wildreel", "label": "Wild Reaper Reel"},
        "symbols": [
            (WILD,    1,  {3: 66, 4: 666, 5: 6666}),
            (SCATTER, 2,  None),
            ("reaper", 3, {3: 50, 4: 300, 5: 2000}),
            ("coffin", 5, {3: 25, 4: 100, 5: 400}),
            ("candle", 7, {3: 12, 4: 40, 5: 150}),
            ("potion", 9, {3: 8, 4: 25, 5: 80}),
            ("A",     12, {3: 4, 4: 12, 5: 40}),
            ("K",     13, {3: 3, 4: 10, 5: 30}),
            ("Q",     15, {3: 2, 4: 7, 5: 20}),
            ("J",     16, {3: 2, 4: 6, 5: 15}),
        ],
    },
    "neonnights": {
        "name": "Neon Nights",
        "tagline": "Retro heat. The multiplier trail climbs as you go.",
        "free_spins": {"trigger": 3, "count": 10, "mult": 5,
                       "profile": [2, 2, 2, 3, 3, 3, 4, 4, 5, 5],
                       "feature": "trail", "label": "Multiplier Trail"},
        "symbols": [
            (WILD,    3,  {3: 30, 4: 120, 5: 500}),
            (SCATTER, 3,  None),
            ("sun",   5,  {3: 20, 4: 70, 5: 220}),
            ("palm",  7,  {3: 14, 4: 45, 5: 140}),
            ("cassette", 8, {3: 10, 4: 30, 5: 90}),
            ("shades", 10, {3: 6, 4: 20, 5: 60}),
            ("A",     12, {3: 4, 4: 12, 5: 36}),
            ("K",     13, {3: 3, 4: 9, 5: 28}),
            ("Q",     14, {3: 2, 4: 7, 5: 20}),
            ("J",     15, {3: 2, 4: 6, 5: 16}),
        ],
    },
    "buffalo": {
        "name": "Buffalo Stampede",
        "tagline": "Fifteen bonus spins, the herd multiplier building all the way.",
        "free_spins": {"trigger": 3, "count": 15, "mult": 5,
                       "profile": [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5],
                       "feature": "stampede", "label": "Stampede Build-Up"},
        "symbols": [
            (WILD,    2,  {3: 40, 4: 180, 5: 900}),
            (SCATTER, 2,  None),
            ("buffalo", 5, {3: 30, 4: 90, 5: 300}),
            ("eagle", 6,  {3: 18, 4: 55, 5: 160}),
            ("wolf",  8,  {3: 12, 4: 35, 5: 100}),
            ("cactus", 9, {3: 8, 4: 22, 5: 65}),
            ("A",     12, {3: 4, 4: 12, 5: 38}),
            ("K",     13, {3: 3, 4: 9, 5: 28}),
            ("Q",     14, {3: 2, 4: 7, 5: 20}),
            ("J",     15, {3: 2, 4: 6, 5: 15}),
        ],
    },
    "fruitblitz": {
        "name": "Fruit Blitz",
        "tagline": "Short, hot bonus — six spins, every win juiced 5x.",
        "free_spins": {"trigger": 3, "count": 6, "mult": 5,
                       "profile": [5] * 6,
                       "feature": "rush", "label": "Juice Rush · 5x"},
        "symbols": [
            (WILD,    3,  {3: 25, 4: 100, 5: 400}),
            (SCATTER, 3,  None),
            ("berry", 6,  {3: 18, 4: 60, 5: 180}),
            ("melon", 7,  {3: 12, 4: 40, 5: 120}),
            ("grape", 9,  {3: 8, 4: 25, 5: 70}),
            ("orange", 10, {3: 6, 4: 18, 5: 50}),
            ("lemon", 11, {3: 4, 4: 12, 5: 35}),
            ("plum",  12, {3: 3, 4: 10, 5: 28}),
            ("cherry", 13, {3: 3, 4: 8, 5: 22}),
        ],
    },
}


def _probs(machine: dict) -> dict[str, Decimal]:
    total = sum(w for _, w, _ in machine["symbols"])
    return {k: Decimal(w) / total for k, w, _ in machine["symbols"]}


def line_pay(machine: dict, symbols_on_line: list[str]) -> Decimal:
    """Best pay of one line, left-to-right, wilds substituting."""
    pays = {k: p for k, _, p in machine["symbols"] if p}
    best = Decimal(0)
    for target, table in pays.items():
        n = 0
        for s in symbols_on_line:
            if s == target or (s == WILD and target != SCATTER):
                n += 1
            else:
                break
        if n >= 3:
            best = max(best, Decimal(str(table.get(n, 0))))
    return best


def _line_ev(machine: dict) -> Decimal:
    """Exact expected line pay per unit line-bet: enumerate 5 cells."""
    probs = _probs(machine)
    keys = [k for k, _, _ in machine["symbols"]]
    ev = Decimal(0)
    for combo in product(keys, repeat=REELS):
        pay = line_pay(machine, list(combo))
        if pay:
            pr = Decimal(1)
            for c in combo:
                pr *= probs[c]
            ev += pr * pay
    return ev


def _sum_profile(machine: dict) -> Decimal:
    """Total multiplier handed out across the whole bonus. Each machine has its
    own per-spin profile (a rising ladder, a flat run, a stampede build-up…);
    an old flat machine falls back to count x mult."""
    fs = machine["free_spins"]
    prof = fs.get("profile")
    return Decimal(sum(prof)) if prof else Decimal(fs["count"] * fs["mult"])


def _p_trigger(machine: dict) -> Decimal:
    """P(enough scatters land in the 15 cells to start the bonus)."""
    p = _probs(machine)[SCATTER]
    trig = machine["free_spins"]["trigger"]
    return sum((Decimal(comb(CELLS, k)) * p**k * (1 - p) ** (CELLS - k)
                for k in range(trig, CELLS + 1)), Decimal(0))


def _bonus_line_ev(machine: dict) -> Decimal:
    """Per-line EV of ONE bonus spin. Same as the base line, unless the machine
    locks whole reels wild for the bonus (Reaper's middle reel) — then it's
    enumerated exactly over the reels that are still live."""
    wild = machine["free_spins"].get("wild_reels")
    if not wild:
        return _line_ev(machine)
    probs = _probs(machine)
    keys = [k for k, _, _ in machine["symbols"]]
    live = [i for i in range(REELS) if i not in wild]
    ev = Decimal(0)
    for combo in product(keys, repeat=len(live)):
        line = [WILD] * REELS
        pr = Decimal(1)
        for pos, c in zip(live, combo):
            line[pos] = c
            pr *= probs[c]
        pay = line_pay(machine, line)
        if pay:
            ev += pr * pay
    return ev


def _raw_rtp(machine: dict) -> Decimal:
    """Full return per line-bet unit: the base game plus the bonus. The bonus
    contribution is P(trigger) x total-bonus-multiplier x per-bonus-spin EV,
    so every feature stays a closed computation and RTP is exact."""
    return (_line_ev(machine)
            + _p_trigger(machine) * _sum_profile(machine) * _bonus_line_ev(machine))


def _normalize() -> None:
    """Scale every machine's pays so RTP == TARGET_RTP exactly (then floor
    to one decimal, which can only make the house richer)."""
    for m in VIDEO_SLOTS.values():
        scale = TARGET_RTP / _raw_rtp(m)
        for i, (k, w, pays) in enumerate(m["symbols"]):
            if pays:
                m["symbols"][i] = (k, w, {
                    n: str((Decimal(p) * scale).quantize(Decimal("0.1"),
                                                         rounding="ROUND_DOWN"))
                    for n, p in pays.items()})


_normalize()


def exact_rtp(machine: dict) -> Decimal:
    return _raw_rtp(machine)


@dataclass(frozen=True)
class SpinResult:
    grid: list[list[str]]          # [reel][row]
    line_wins: list[dict]          # {line, symbol, count, pay}
    scatters: int
    total_pay: Decimal             # in line-bet units
    triggered: bool


def spin(server: str, client: str, nonce: int, machine_key: str,
         wild_reels: list[int] | None = None) -> SpinResult:
    m = VIDEO_SLOTS[machine_key]
    keys = [k for k, _, _ in m["symbols"]]
    weights = [w for _, w, _ in m["symbols"]]
    total_w = sum(weights)
    fs = fairness.floats(server, client, nonce, CELLS)
    cells: list[str] = []
    for f in fs:
        target = f * total_w
        acc = 0
        pick = keys[-1]
        for k, w in zip(keys, weights):
            acc += w
            if target < acc:
                pick = k
                break
        cells.append(pick)
    grid = [[cells[r * ROWS + row] for row in range(ROWS)] for r in range(REELS)]
    # a bonus feature can lock whole reels wild (Reaper) before wins are read
    if wild_reels:
        for r in wild_reels:
            if 0 <= r < REELS:
                grid[r] = [WILD, WILD, WILD]

    pays = {k: p for k, _, p in m["symbols"] if p}
    wins: list[dict] = []
    total = Decimal(0)
    for li, shape in enumerate(LINES):
        line_syms = [grid[reel][shape[reel]] for reel in range(REELS)]
        best_pay, best_sym, best_n = Decimal(0), None, 0
        for tgt, table in pays.items():
            n = 0
            for s in line_syms:
                if s == tgt or (s == WILD and tgt != SCATTER):
                    n += 1
                else:
                    break
            if n >= 3 and Decimal(str(table.get(n, 0))) > best_pay:
                best_pay = Decimal(str(table.get(n, 0)))
                best_sym, best_n = tgt, n
        if best_pay > 0:
            wins.append({"line": li, "symbol": best_sym, "count": best_n,
                         "pay": str(best_pay)})
            total += best_pay

    scatters = sum(col.count(SCATTER) for col in grid)
    return SpinResult(grid=grid, line_wins=wins, scatters=scatters,
                      total_pay=total,
                      triggered=scatters >= m["free_spins"]["trigger"])


def bonus_ev_per_stake(machine: dict) -> Decimal:
    """Expected bonus payout in stake units: the whole profile's multiplier
    against the per-bonus-spin line EV (wild reels included)."""
    return _sum_profile(machine) * _bonus_line_ev(machine)


def buy_cost_mult(machine: dict) -> int:
    """Bonus Buy price as a whole multiple of the bet, priced so the buy
    returns TARGET_RTP exactly -- then rounded UP, which favors the house."""
    cost = bonus_ev_per_stake(machine) / TARGET_RTP
    return int(cost.to_integral_value(rounding="ROUND_CEILING"))
