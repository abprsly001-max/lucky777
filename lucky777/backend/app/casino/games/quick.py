"""Quick games: Lucky 7, Rock Paper Scissors, Darts, Prism, and the two
streak ladders (Penalty Shootout, Penguin Dash). Pure functions, exact edges.
"""
from dataclasses import dataclass
from decimal import Decimal

from ...core import fairness

# ---------------------------------------------------------------- lucky 7 ----
# two dice: under 7 / exactly 7 / over 7. Pays chosen so each bet returns
# the same percent: P(under) = P(over) = 15/36, P(seven) = 6/36.
L7_PAYS = {"under": Decimal("2.3"), "seven": Decimal("5.75"),
           "over": Decimal("2.3")}     # total return per stake on a win
# RTP: 15/36 * 2.3 = 0.9583 ;  6/36 * 5.75 = 0.9583


def lucky7_roll(server: str, client: str, nonce: int) -> tuple[int, int]:
    fs = fairness.floats(server, client, nonce, 2)
    return (min(int(Decimal(str(fs[0])) * 6), 5) + 1,
            min(int(Decimal(str(fs[1])) * 6), 5) + 1)


def lucky7_settle(bet: str, total: int) -> Decimal:
    if total < 7 and bet == "under":
        return L7_PAYS["under"]
    if total == 7 and bet == "seven":
        return L7_PAYS["seven"]
    if total > 7 and bet == "over":
        return L7_PAYS["over"]
    return Decimal(0)


def lucky7_rtp(bet: str) -> Decimal:
    p = Decimal(6 if bet == "seven" else 15) / 36
    return p * L7_PAYS[bet]


# -------------------------------------------------------------------- rps ----
RPS_WIN_PAYS = Decimal("1.92")          # tie pushes; edge = (1 - 0.92)/3-ish
RPS_MOVES = ("rock", "paper", "scissors")


def rps_house(server: str, client: str, nonce: int) -> str:
    f = fairness.floats(server, client, nonce, 1)[0]
    return RPS_MOVES[min(int(Decimal(str(f)) * 3), 2)]


def rps_settle(player: str, house: str) -> Decimal:
    """Total return per stake: win 1.92, tie 1 (push), lose 0."""
    if player == house:
        return Decimal(1)
    beats = {"rock": "scissors", "paper": "rock", "scissors": "paper"}
    return RPS_WIN_PAYS if beats[player] == house else Decimal(0)


def rps_rtp() -> Decimal:
    return (RPS_WIN_PAYS + 1) / 3


# ------------------------------------------------------------------ darts ----
# pick a ring; the dart lands by probability; a hit pays true odds less 4%
DARTS_RINGS: list[tuple[str, Decimal]] = [
    ("bullseye", Decimal("0.05")), ("inner", Decimal("0.15")),
    ("middle", Decimal("0.30")), ("outer", Decimal("0.50")),
]
_DARTS_HOUSE = Decimal("0.96")


def darts_mult(ring: str) -> Decimal:
    p = dict(DARTS_RINGS)[ring]
    return (_DARTS_HOUSE / p).quantize(Decimal("0.01"), rounding="ROUND_DOWN")


def darts_throw(server: str, client: str, nonce: int) -> str:
    """Where the dart lands, by ring probability."""
    f = Decimal(str(fairness.floats(server, client, nonce, 1)[0]))
    acc = Decimal(0)
    for ring, p in DARTS_RINGS:
        acc += p
        if f < acc:
            return ring
    return DARTS_RINGS[-1][0]


# ------------------------------------------------------------------ prism ----
# a gem wheel: fixed probabilities, pays scaled at import to the target
PRISM_TARGET = Decimal("0.96")
_PRISM_RAW: list[tuple[str, Decimal, Decimal]] = [   # gem, prob, raw pay
    ("shard", Decimal("0.15"), Decimal("1.2")),
    ("topaz", Decimal("0.08"), Decimal("2")),
    ("emerald", Decimal("0.04"), Decimal("5")),
    ("sapphire", Decimal("0.015"), Decimal("15")),
    ("diamond", Decimal("0.005"), Decimal("50")),
]
_raw_rtp = sum(p * m for _, p, m in _PRISM_RAW)
_PRISM_SCALE = PRISM_TARGET / _raw_rtp
PRISM_SEGMENTS: list[tuple[str, Decimal, Decimal]] = [
    (g, p, (m * _PRISM_SCALE).quantize(Decimal("0.01"), rounding="ROUND_DOWN"))
    for g, p, m in _PRISM_RAW
]


def prism_rtp() -> Decimal:
    return sum(p * m for _, p, m in PRISM_SEGMENTS)


def prism_spin(server: str, client: str, nonce: int) -> tuple[str, Decimal]:
    """(gem, multiplier); 'dust' at 0x when nothing hits."""
    f = Decimal(str(fairness.floats(server, client, nonce, 1)[0]))
    acc = Decimal(0)
    for gem, p, m in PRISM_SEGMENTS:
        acc += p
        if f < acc:
            return gem, m
    return "dust", Decimal(0)


# ---------------------------------------------------------- streak ladders ----
# one mechanic, two skins: survive a step at probability p, multiplier climbs
# at true odds less the edge, cash out between steps, miss and it's gone.
LADDER_EDGE = Decimal("0.04")

LADDERS: dict[str, dict] = {
    "penalty": {
        "name": "Penalty Shootout", "step_p": {"normal": Decimal("0.60")},
        "max_steps": {"normal": 5}, "levels": ["normal"],
    },
    "penguin": {
        "name": "Penguin Dash",
        "step_p": {"easy": Decimal("0.75"), "medium": Decimal("0.50"),
                   "hard": Decimal("0.25")},
        "max_steps": {"easy": 12, "medium": 9, "hard": 6},
        "levels": ["easy", "medium", "hard"],
    },
}


def ladder_mult(game: str, level: str, steps: int) -> Decimal:
    p = LADDERS[game]["step_p"][level]
    fair = (Decimal(1) / p) ** steps
    return ((Decimal(1) - LADDER_EDGE) * fair).quantize(
        Decimal("0.0001"), rounding="ROUND_DOWN")


def ladder_step(server: str, client: str, nonce: int, game: str,
                level: str, step: int) -> bool:
    """True = survived step number `step` (0-based)."""
    p = LADDERS[game]["step_p"][level]
    f = fairness.floats(server, client, nonce, step + 1)[step]
    return Decimal(str(f)) < p
