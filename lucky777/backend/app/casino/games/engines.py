"""Casino game engines: dice, wheel, blackjack. Pure functions, no I/O.

Every random draw comes from the commit-reveal fairness stream
(core.fairness.floats), so any player can recompute any round after rotating
their seed. House edges are fixed, published, and shown in the lobby.
"""
from dataclasses import dataclass
from decimal import Decimal

from ...core import fairness

# ------------------------------------------------------------------- dice ----
DICE_EDGE = Decimal("4")            # published: 96% RTP
DICE_MIN_CHANCE = Decimal("2")
DICE_MAX_CHANCE = Decimal("95")


def dice_multiplier(chance: Decimal) -> Decimal:
    """Win-chance % -> payout multiplier at the published edge."""
    return ((Decimal(100) - DICE_EDGE) / chance).quantize(Decimal("0.0001"))


@dataclass(frozen=True)
class DiceOutcome:
    roll: Decimal          # 0.00 .. 99.99
    win: bool
    multiplier: Decimal


def dice_play(server: str, client: str, nonce: int, chance: Decimal) -> DiceOutcome:
    f = fairness.floats(server, client, nonce, 1)[0]
    roll = (Decimal(str(f)) * 100).quantize(Decimal("0.01"))
    win = roll < chance
    return DiceOutcome(roll=roll, win=win,
                       multiplier=dice_multiplier(chance) if win else Decimal(0))


# ------------------------------------------------------------------ wheel ----
# segments: (probability, multiplier) -- each risk level's RTP is the dot
# product, printed in the lobby. Probabilities sum to 1 exactly.
WHEEL = {
    "low":    [(Decimal("0.35"), Decimal("0")), (Decimal("0.35"), Decimal("1.2")),
               (Decimal("0.25"), Decimal("1.5")), (Decimal("0.05"), Decimal("3"))],
    "medium": [(Decimal("0.60"), Decimal("0")), (Decimal("0.25"), Decimal("2")),
               (Decimal("0.15"), Decimal("3"))],
    "high":   [(Decimal("0.80"), Decimal("0")), (Decimal("0.10"), Decimal("4")),
               (Decimal("0.07"), Decimal("5")), (Decimal("0.03"), Decimal("6"))],
}


def wheel_rtp(risk: str) -> Decimal:
    return sum(p * m for p, m in WHEEL[risk])


@dataclass(frozen=True)
class WheelOutcome:
    roll: Decimal
    segment: int
    multiplier: Decimal


def wheel_play(server: str, client: str, nonce: int, risk: str) -> WheelOutcome:
    f = Decimal(str(fairness.floats(server, client, nonce, 1)[0]))
    acc = Decimal(0)
    for i, (p, m) in enumerate(WHEEL[risk]):
        acc += p
        if f < acc:
            return WheelOutcome(roll=f.quantize(Decimal("0.0001")), segment=i, multiplier=m)
    last = len(WHEEL[risk]) - 1
    return WheelOutcome(roll=f.quantize(Decimal("0.0001")), segment=last,
                        multiplier=WHEEL[risk][last][1])


# -------------------------------------------------------------- blackjack ----
# Rules, printed in the lobby: single deck dealt fresh each hand, dealer
# stands on ALL 17s, blackjack pays 3:2, double on any first two cards,
# no splits, no insurance. The whole deck order is fixed at the deal by the
# fairness stream -- hitting just reveals the next card.

RANKS = "A23456789TJQK"
SUITS = "shdc"


def card_name(c: int) -> str:
    return f"{RANKS[c % 13]}{SUITS[c // 13]}"


def card_value(c: int) -> int:
    r = c % 13
    if r == 0:
        return 11               # ace, downgraded to 1 by best_total when needed
    return min(r + 1, 10)


def best_total(cards: list[int]) -> int:
    total = sum(card_value(c) for c in cards)
    aces = sum(1 for c in cards if c % 13 == 0)
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total


def shuffled_deck(server: str, client: str, nonce: int) -> list[int]:
    """Fisher-Yates driven by the fairness stream: verifiable shuffles."""
    fs = fairness.floats(server, client, nonce, 52)
    deck = list(range(52))
    for i in range(51, 0, -1):
        j = int(fs[51 - i] * (i + 1))
        deck[i], deck[j] = deck[j], deck[i]
    return deck


def dealer_play(deck: list[int], dealer: list[int], cursor: int) -> tuple[list[int], int]:
    """Dealer draws to 17, stands on all 17s. Returns (hand, new cursor)."""
    hand = list(dealer)
    while best_total(hand) < 17:
        hand.append(deck[cursor])
        cursor += 1
    return hand, cursor


# ---- blackjack side bets: settled at the deal off the player's two cards
# plus the dealer's upcard. Single-deck paytables, edges solved exactly by
# enumeration (see tests): 21+3 holds 3.33%, Lucky Lucky holds 2.61%.

SIDE_21P3_PAYS = {"straight_flush": 40, "trips": 30, "straight": 10, "flush": 8}
SIDE_LUCKY_PAYS = {"678_suited": 100, "777": 50, "678": 30,
                   "21_suited": 15, "21": 3, "20": 2, "19": 2}


def _is_straight(ranks: list[int]) -> bool:
    x = sorted(ranks)
    if x == [0, 11, 12]:                    # Q-K-A plays as a straight too
        return True
    return x[1] == x[0] + 1 and x[2] == x[1] + 1


def side_21p3(player: list[int], dealer_up: int) -> tuple[str | None, int]:
    """(hand name, pay multiple) for the three-card poker side bet."""
    cards = [player[0], player[1], dealer_up]
    ranks = [c % 13 for c in cards]
    suits = [c // 13 for c in cards]
    flush = len(set(suits)) == 1
    straight = _is_straight(ranks)
    if len(set(ranks)) == 1:
        return "trips", SIDE_21P3_PAYS["trips"]
    if flush and straight:
        return "straight_flush", SIDE_21P3_PAYS["straight_flush"]
    if straight:
        return "straight", SIDE_21P3_PAYS["straight"]
    if flush:
        return "flush", SIDE_21P3_PAYS["flush"]
    return None, 0


def side_lucky(player: list[int], dealer_up: int) -> tuple[str | None, int]:
    """(hand name, pay multiple) for the three-card total side bet."""
    cards = [player[0], player[1], dealer_up]
    ranks = [c % 13 for c in cards]
    suits = [c // 13 for c in cards]
    suited = len(set(suits)) == 1
    total = best_total(cards)
    sevens = all(r == 6 for r in ranks)
    s678 = sorted(ranks) == [5, 6, 7]
    if s678 and suited:
        return "678_suited", SIDE_LUCKY_PAYS["678_suited"]
    if sevens:
        return "777", SIDE_LUCKY_PAYS["777"]
    if s678:
        return "678", SIDE_LUCKY_PAYS["678"]
    if total == 21 and suited:
        return "21_suited", SIDE_LUCKY_PAYS["21_suited"]
    if total == 21:
        return "21", SIDE_LUCKY_PAYS["21"]
    if total == 20:
        return "20", SIDE_LUCKY_PAYS["20"]
    if total == 19:
        return "19", SIDE_LUCKY_PAYS["19"]
    return None, 0


def settle_blackjack(player: list[int], dealer: list[int],
                     stake_micros: int, natural: bool) -> int:
    """Total returned to the wallet. Stake here is the FULL amount staked
    (doubled hands pass the doubled stake)."""
    pt, dt = best_total(player), best_total(dealer)
    if pt > 21:
        return 0
    if natural:
        if dt == 21 and len(dealer) == 2:
            return stake_micros                     # both natural: push
        return stake_micros * 5 // 2                # 3:2
    if dt > 21 or pt > dt:
        return stake_micros * 2
    if pt == dt:
        return stake_micros
    return 0


# ------------------------------------------------------------------ slots ----
# Classic 3-reel machines. Each reel is an independent weighted draw from the
# fairness stream, so every spin is verifiable. The paytable is the whole
# game: exact_rtp() enumerates all combinations, and the lobby prints that
# number -- the machine cannot lie about itself.

SLOT_MACHINES: dict[str, dict] = {
    "gold777": {
        "name": "Gold 777",
        "tagline": "The classic. Three golden sevens pay 250x.",
        "symbols": ["seven", "bar", "bell", "cherry", "blank"],
        "weights": [2, 4, 6, 8, 12],
        "triples": {"seven": Decimal("250"), "bar": Decimal("60"),
                    "bell": Decimal("25"), "cherry": Decimal("10")},
        # cherries pay something even off a miss, like the old iron machines
        "partial": {"symbol": "cherry", "two": Decimal("2"), "one": Decimal("0.4")},
    },
    "fruitfrenzy": {
        "name": "Fruit Frenzy",
        "tagline": "Low volatility -- lots of little hits.",
        "symbols": ["melon", "grapes", "orange", "lemon", "cherry"],
        "weights": [3, 5, 7, 8, 9],
        "triples": {"melon": Decimal("40"), "grapes": Decimal("18"),
                    "orange": Decimal("12"), "lemon": Decimal("7"),
                    "cherry": Decimal("6")},
        "partial": {"symbol": "cherry", "two": Decimal("1.5"), "one": Decimal("0.5")},
    },
    "diamondriches": {
        "name": "Diamond Riches",
        "tagline": "High volatility. Three diamonds pay 500x.",
        "symbols": ["diamond", "ring", "coin", "crown", "blank"],
        "weights": [1, 3, 5, 7, 14],
        "triples": {"diamond": Decimal("500"), "ring": Decimal("150"),
                    "coin": Decimal("55"), "crown": Decimal("26")},
        "partial": {"symbol": "diamond", "two": Decimal("10"), "one": Decimal("1.6")},
    },
    "luckyclover": {
        "name": "Lucky Clover",
        "tagline": "Middle of the road, easy to hit.",
        "symbols": ["clover", "horseshoe", "star", "moon", "blank"],
        "weights": [2, 4, 7, 9, 10],
        "triples": {"clover": Decimal("150"), "horseshoe": Decimal("80"),
                    "star": Decimal("25"), "moon": Decimal("12")},
        "partial": {"symbol": "clover", "two": Decimal("5"), "one": Decimal("1")},
    },
}


def slot_multiplier(machine: dict, reels: list[str]) -> Decimal:
    """Payout multiplier for a stopped set of reels. Triples first, then the
    machine's partial symbol (2-of or 1-of anywhere)."""
    if reels[0] == reels[1] == reels[2]:
        pay = machine["triples"].get(reels[0])
        if pay is not None:
            return pay
    part = machine.get("partial")
    if part:
        n = reels.count(part["symbol"])
        if n == 2:
            return part["two"]
        if n == 1:
            return part["one"]
    return Decimal(0)


def slot_exact_rtp(machine: dict) -> Decimal:
    """True RTP by enumerating every reel combination -- no simulation."""
    total = Decimal(sum(machine["weights"]))
    probs = {s: Decimal(w) / total
             for s, w in zip(machine["symbols"], machine["weights"])}
    rtp = Decimal(0)
    for a in machine["symbols"]:
        for b in machine["symbols"]:
            for c in machine["symbols"]:
                rtp += probs[a] * probs[b] * probs[c] * slot_multiplier(machine, [a, b, c])
    return rtp


@dataclass(frozen=True)
class SlotOutcome:
    reels: list[str]
    multiplier: Decimal


def slot_spin(server: str, client: str, nonce: int, machine_key: str) -> SlotOutcome:
    machine = SLOT_MACHINES[machine_key]
    fs = fairness.floats(server, client, nonce, 3)
    total = sum(machine["weights"])
    reels: list[str] = []
    for f in fs:
        target = Decimal(str(f)) * total
        acc = Decimal(0)
        picked = machine["symbols"][-1]
        for sym, w in zip(machine["symbols"], machine["weights"]):
            acc += w
            if target < acc:
                picked = sym
                break
        reels.append(picked)
    return SlotOutcome(reels=reels, multiplier=slot_multiplier(machine, reels))


# --------------------------------------------------------------- roulette ----
# European single-zero wheel: 37 pockets, every bet pays as if there were 36.
# That gap IS the whole house edge: 1/37 ~ 2.70%.

ROULETTE_RED = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}


def roulette_pocket(server: str, client: str, nonce: int) -> int:
    f = fairness.floats(server, client, nonce, 1)[0]
    return min(36, int(f * 37))


def roulette_pays(kind: str, pick: int | None, pocket: int) -> Decimal:
    """Total-return multiplier for one bet. 0 means the bet lost."""
    if kind == "straight":
        return Decimal(36) if pocket == pick else Decimal(0)
    if pocket == 0:
        return Decimal(0)                       # zero beats every outside bet
    if kind == "red":
        return Decimal(2) if pocket in ROULETTE_RED else Decimal(0)
    if kind == "black":
        return Decimal(2) if pocket not in ROULETTE_RED else Decimal(0)
    if kind == "even":
        return Decimal(2) if pocket % 2 == 0 else Decimal(0)
    if kind == "odd":
        return Decimal(2) if pocket % 2 == 1 else Decimal(0)
    if kind == "low":
        return Decimal(2) if pocket <= 18 else Decimal(0)
    if kind == "high":
        return Decimal(2) if pocket >= 19 else Decimal(0)
    if kind == "dozen":                          # pick 0,1,2
        return Decimal(3) if (pocket - 1) // 12 == pick else Decimal(0)
    if kind == "column":                         # pick 0,1,2 -> columns 1,2,3
        return Decimal(3) if (pocket - 1) % 3 == pick else Decimal(0)
    raise ValueError(f"unknown roulette bet {kind}")


ROULETTE_KINDS = ("straight", "red", "black", "even", "odd", "low", "high",
                  "dozen", "column")


# ------------------------------------------------------------ video poker ----
# Jacks or Better, full-pay 9/6 table. Multipliers are TOTAL RETURN on the
# stake; a plain high pair just gives the money back.

VP_PAYTABLE: list[tuple[str, Decimal]] = [
    ("Royal Flush", Decimal(800)),
    ("Straight Flush", Decimal(50)),
    ("Four of a Kind", Decimal(25)),
    ("Full House", Decimal(9)),
    ("Flush", Decimal(6)),
    ("Straight", Decimal(4)),
    ("Three of a Kind", Decimal(3)),
    ("Two Pair", Decimal(2)),
    ("Jacks or Better", Decimal(1)),
]
_VP_PAYS = dict(VP_PAYTABLE)


def vp_evaluate(hand: list[int]) -> tuple[str, Decimal]:
    """Name and total-return multiplier of a 5-card hand."""
    ranks = [c % 13 for c in hand]               # 0=A 1=2 .. 9=T 10=J 11=Q 12=K
    suits = {c // 13 for c in hand}
    counts = sorted((ranks.count(r) for r in set(ranks)), reverse=True)
    flush = len(suits) == 1
    uniq = sorted(set(ranks))
    straight = (len(uniq) == 5 and uniq[4] - uniq[0] == 4)
    ace_high = uniq == [0, 9, 10, 11, 12]        # A T J Q K
    straight = straight or ace_high

    if flush and ace_high:
        return "Royal Flush", _VP_PAYS["Royal Flush"]
    if flush and straight:
        return "Straight Flush", _VP_PAYS["Straight Flush"]
    if counts[0] == 4:
        return "Four of a Kind", _VP_PAYS["Four of a Kind"]
    if counts[0] == 3 and counts[1] == 2:
        return "Full House", _VP_PAYS["Full House"]
    if flush:
        return "Flush", _VP_PAYS["Flush"]
    if straight:
        return "Straight", _VP_PAYS["Straight"]
    if counts[0] == 3:
        return "Three of a Kind", _VP_PAYS["Three of a Kind"]
    if counts[0] == 2 and counts[1] == 2:
        return "Two Pair", _VP_PAYS["Two Pair"]
    if counts[0] == 2:
        pair_rank = next(r for r in set(ranks) if ranks.count(r) == 2)
        if pair_rank in (0, 10, 11, 12):         # A J Q K
            return "Jacks or Better", _VP_PAYS["Jacks or Better"]
    return "Nothing", Decimal(0)


# --------------------------------------------------------------- baccarat ----
# Punto banco with the standard third-card tableau, dealt from a fresh
# 8-deck shoe shuffled by the fairness stream every hand.

def baccarat_shoe(server: str, client: str, nonce: int) -> list[int]:
    n = 52 * 8
    fs = fairness.floats(server, client, nonce, n)
    shoe = [i % 52 for i in range(n)]
    for i in range(n - 1, 0, -1):
        j = int(fs[n - 1 - i] * (i + 1))
        shoe[i], shoe[j] = shoe[j], shoe[i]
    return shoe


def _bacc_val(c: int) -> int:
    r = c % 13
    if r == 0:
        return 1                                  # ace
    return min(r + 1, 10) % 10                    # T/J/Q/K count zero


def _bacc_total(cards: list[int]) -> int:
    return sum(_bacc_val(c) for c in cards) % 10


def baccarat_deal(shoe: list[int]) -> dict:
    """Play one coup by the book. Returns hands, totals and the outcome."""
    player = [shoe[0], shoe[2]]
    banker = [shoe[1], shoe[3]]
    cursor = 4
    pt, bt = _bacc_total(player), _bacc_total(banker)

    if pt < 8 and bt < 8:                         # no natural: tableau applies
        third: int | None = None
        if pt <= 5:
            third = shoe[cursor]; cursor += 1
            player.append(third)
        tv = _bacc_val(third) if third is not None else None
        bt = _bacc_total(banker)
        draw = (bt <= 5 if tv is None else
                bt <= 2 or
                (bt == 3 and tv != 8) or
                (bt == 4 and 2 <= tv <= 7) or
                (bt == 5 and 4 <= tv <= 7) or
                (bt == 6 and 6 <= tv <= 7))
        if draw:
            banker.append(shoe[cursor]); cursor += 1
        pt, bt = _bacc_total(player), _bacc_total(banker)

    outcome = "tie" if pt == bt else "player" if pt > bt else "banker"
    return {"player": player, "banker": banker,
            "player_total": pt, "banker_total": bt, "outcome": outcome}


def baccarat_pays(bet: str, outcome: str) -> Decimal:
    """Total-return multiplier. Player/banker push on a tie."""
    if bet == "tie":
        return Decimal(9) if outcome == "tie" else Decimal(0)
    if outcome == "tie":
        return Decimal(1)
    if bet == outcome:
        return Decimal("1.95") if bet == "banker" else Decimal(2)
    return Decimal(0)


# ------------------------------------------------------------------ mines ----
MINES_EDGE = Decimal("0.03")                      # printed in the lobby
MINES_GRID = 25


def mines_layout(server: str, client: str, nonce: int, mines: int) -> list[int]:
    """Which cells hide mines: a fairness-driven partial Fisher-Yates."""
    fs = fairness.floats(server, client, nonce, mines)
    cells = list(range(MINES_GRID))
    for i in range(mines):
        j = i + int(fs[i] * (MINES_GRID - i))
        cells[i], cells[j] = cells[j], cells[i]
    return sorted(cells[:mines])


def mines_multiplier(mines: int, revealed: int) -> Decimal:
    """Cash-out multiplier after `revealed` safe picks: the true inverse odds
    of surviving, shaved by the printed edge."""
    if revealed == 0:
        return Decimal(1)
    num = den = Decimal(1)
    for i in range(revealed):
        num *= MINES_GRID - i
        den *= MINES_GRID - mines - i
    return ((Decimal(1) - MINES_EDGE) * num / den).quantize(Decimal("0.0001"))


# ------------------------------------------------------------------ crash ----
CRASH_EDGE = Decimal("0.04")
CRASH_CAP = Decimal("1000")


def crash_point(server: str, client: str, nonce: int) -> Decimal:
    """Where the rocket dies. P(point >= t) = (1-edge)/t, so cashing out at
    any target t returns exactly (1-edge) of the stake in expectation."""
    f = Decimal(str(fairness.floats(server, client, nonce, 1)[0]))
    if f < CRASH_EDGE:
        return Decimal("1.00")                    # instant bust
    pt = (Decimal(1) - CRASH_EDGE) / (Decimal(1) - f)
    return min(CRASH_CAP, pt.quantize(Decimal("0.01"), rounding="ROUND_DOWN"))


CRASH_RATE = 0.10          # e^(rate * seconds): 2.7x at 10s, 10x at ~23s


def crash_multiplier_at(seconds: float) -> Decimal:
    from math import exp
    if seconds <= 0:
        return Decimal("1.00")
    m = Decimal(str(exp(CRASH_RATE * seconds)))
    return min(CRASH_CAP, m.quantize(Decimal("0.01"), rounding="ROUND_DOWN"))


# ----------------------------------------------------------------- plinko ----
# The ball takes `rows` left/right steps off the fairness stream; the bucket is
# how many went right. Buckets follow the binomial distribution, so the payout
# tables are normalized at import: whatever shape we give them, every
# (rows, risk) board is scaled to the same target return. Big edges pay the
# rims, the middle eats the stake.

PLINKO_TARGET_RTP = Decimal("0.96")
PLINKO_ROWS = (8, 12, 16)

_PLINKO_SHAPES: dict[int, dict[str, list[str]]] = {
    8: {
        "low":    ["5.6", "2.1", "1.1", "1", "0.5", "1", "1.1", "2.1", "5.6"],
        "medium": ["13", "3", "1.3", "0.7", "0.4", "0.7", "1.3", "3", "13"],
        "high":   ["29", "4", "1.5", "0.3", "0.2", "0.3", "1.5", "4", "29"],
    },
    12: {
        "low":    ["10", "3", "1.6", "1.4", "1.1", "1", "0.5",
                   "1", "1.1", "1.4", "1.6", "3", "10"],
        "medium": ["24", "5", "2", "1.4", "0.7", "0.3", "0.2",
                   "0.3", "0.7", "1.4", "2", "5", "24"],
        "high":   ["58", "8", "3", "1", "0.2", "0.2", "0.1",
                   "0.2", "0.2", "1", "3", "8", "58"],
    },
    16: {
        "low":    ["16", "9", "2", "1.4", "1.4", "1.2", "1.1", "1", "0.5",
                   "1", "1.1", "1.2", "1.4", "1.4", "2", "9", "16"],
        "medium": ["110", "41", "10", "5", "3", "1.5", "1", "0.5", "0.3",
                   "0.5", "1", "1.5", "3", "5", "10", "41", "110"],
        "high":   ["1000", "130", "26", "9", "4", "2", "0.2", "0.2", "0.2",
                   "0.2", "0.2", "2", "4", "9", "26", "130", "1000"],
    },
}


def _binom(n: int, k: int) -> int:
    from math import comb
    return comb(n, k)


def _normalize(rows: int, shape: list[str]) -> list[Decimal]:
    mults = [Decimal(m) for m in shape]
    denom = Decimal(2) ** rows
    ev = sum(Decimal(_binom(rows, k)) / denom * m for k, m in enumerate(mults))
    scale = PLINKO_TARGET_RTP / ev
    return [(m * scale).quantize(Decimal("0.01"), rounding="ROUND_DOWN")
            for m in mults]


PLINKO_TABLES: dict[int, dict[str, list[Decimal]]] = {
    rows: {risk: _normalize(rows, shape) for risk, shape in risks.items()}
    for rows, risks in _PLINKO_SHAPES.items()
}


def plinko_rtp(rows: int, risk: str) -> Decimal:
    mults = PLINKO_TABLES[rows][risk]
    denom = Decimal(2) ** rows
    return sum(Decimal(_binom(rows, k)) / denom * m for k, m in enumerate(mults))


@dataclass(frozen=True)
class PlinkoOutcome:
    path: list[int]        # 0 = left, 1 = right, one per row
    bucket: int            # rights count, 0..rows
    multiplier: Decimal


def plinko_play(server: str, client: str, nonce: int,
                rows: int, risk: str) -> PlinkoOutcome:
    fs = fairness.floats(server, client, nonce, rows)
    path = [1 if f >= 0.5 else 0 for f in fs]
    bucket = sum(path)
    return PlinkoOutcome(path=path, bucket=bucket,
                         multiplier=PLINKO_TABLES[rows][risk][bucket])
