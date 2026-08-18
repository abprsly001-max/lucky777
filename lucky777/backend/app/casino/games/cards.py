"""Card quick-games: Acey Ducey, Casino War, 10 Card Flip, Ride the Bus,
Suit Link, High Card Flush. Pure functions, exact edges.

The ladder-style games draw each card fresh (rank and suit uniform -- stated
in the rules); High Card Flush deals 5 from a real 52-card deck.
"""
from decimal import Decimal
from functools import lru_cache
from math import comb

from ...core import fairness

_RANKS = "A23456789TJQK"
_SUITS = "shdc"
HOUSE = Decimal("0.96")


def draw_card(server: str, client: str, nonce: int, step: int) -> str:
    f = fairness.floats(server, client, nonce, step + 1)[step]
    idx = min(int(Decimal(str(f)) * 52), 51)
    return _RANKS[idx % 13] + _SUITS[idx // 13]


def rank(card: str) -> int:
    return _RANKS.index(card[0]) + 1        # A low = 1 .. K = 13


# ------------------------------------------------------------- acey ducey ----
def acey_probs(lo: int, hi: int) -> tuple[Decimal, Decimal]:
    """(P strictly between, P strictly outside); boundary ranks lose."""
    if lo > hi:
        lo, hi = hi, lo
    between = Decimal(max(hi - lo - 1, 0)) / 13
    outside = Decimal((lo - 1) + (13 - hi)) / 13
    return between, outside


def acey_mult(p: Decimal) -> Decimal:
    if p <= 0:
        return Decimal(0)
    return (HOUSE / p).quantize(Decimal("0.0001"), rounding="ROUND_DOWN")


# ------------------------------------------------------------- casino war ----
# base: high card wins even money. On a tie you surrender (half back) or go
# to WAR: a second stake, one card each -- win 3x back of the 2 staked, a
# second tie pays 4x back, a loss forfeits both.
WAR_SURRENDER = Decimal("0.5")


def war_edge() -> Decimal:
    p_tie = Decimal(1) / 13
    p_win = (1 - p_tie) / 2
    war_net = p_win * 1 + p_tie * 2 - p_win * 2      # per original stake
    return -(p_win * 1 - p_win * 1 + p_tie * war_net)


# ------------------------------------------------------------ 10 card flip ----
FLIP_REDS, FLIP_BLACKS = 5, 5


def flip_deck(server: str, client: str, nonce: int) -> list[str]:
    """5 red + 5 black, shuffled by the fairness stream."""
    fs = fairness.floats(server, client, nonce, 10)
    deck = ["r"] * FLIP_REDS + ["b"] * FLIP_BLACKS
    for i in range(9):
        j = i + int(Decimal(str(fs[i])) * (10 - i))
        j = min(j, 9)
        deck[i], deck[j] = deck[j], deck[i]
    return deck


def flip_step_mult(reds_left: int, blacks_left: int) -> Decimal:
    """Multiplier for surviving the next flip, at true hypergeometric odds."""
    total = reds_left + blacks_left
    if reds_left <= 0 or total <= 0:
        return Decimal(0)
    p = Decimal(reds_left) / total
    return (HOUSE / p).quantize(Decimal("0.0001"), rounding="ROUND_DOWN")


# ------------------------------------------------------------ ride the bus ----
BUS_STAGES = ["color", "hilo", "inout", "suit"]


def bus_options(stage: str, cards: list[str]) -> dict[str, Decimal]:
    """Choice -> multiplier for the current stage, given cards so far."""
    if stage == "color":
        m = (HOUSE / Decimal("0.5")).quantize(Decimal("0.0001"))
        return {"red": m, "black": m}
    if stage == "hilo":
        r = rank(cards[0])
        return {k: acey_mult(p) for k, p in
                (("higher", Decimal(13 - r) / 13),
                 ("lower", Decimal(r - 1) / 13)) if p > 0}
    if stage == "inout":
        b, o = acey_probs(rank(cards[0]), rank(cards[1]))
        out = {}
        if b > 0:
            out["inside"] = acey_mult(b)
        if o > 0:
            out["outside"] = acey_mult(o)
        return out
    m = (HOUSE / Decimal("0.25")).quantize(Decimal("0.0001"))
    return {s: m for s in ("s", "h", "d", "c")}


def bus_correct(stage: str, choice: str, cards: list[str], new: str) -> bool:
    if stage == "color":
        red = new[1] in "hd"
        return (choice == "red") == red
    if stage == "hilo":
        nr, r0 = rank(new), rank(cards[0])
        return nr > r0 if choice == "higher" else nr < r0
    if stage == "inout":
        lo, hi = sorted((rank(cards[0]), rank(cards[1])))
        nr = rank(new)
        inside = lo < nr < hi
        outside = nr < lo or nr > hi
        return inside if choice == "inside" else outside
    return new[1] == choice


# -------------------------------------------------------------- suit link ----
SUIT_BOTH = (HOUSE / 2 / (Decimal(1) / 16)).quantize(Decimal("0.01"))   # 7.68
SUIT_ONE = (HOUSE / 2 / (Decimal(3) / 8)).quantize(Decimal("0.01"))    # 1.28


def suitlink_settle(suit: str, a: str, b: str) -> Decimal:
    hits = (a[1] == suit) + (b[1] == suit)
    return SUIT_BOTH if hits == 2 else SUIT_ONE if hits == 1 else Decimal(0)


def suitlink_rtp() -> Decimal:
    return (SUIT_BOTH / 16) + SUIT_ONE * Decimal(3) / 8


# --------------------------------------------------------- high card flush ----
HCF_CARDS = 5


@lru_cache(maxsize=None)
def hcf_probs() -> dict[int, Decimal]:
    """P(longest suit run = k) in 5 cards off a real 52-card deck, exact."""
    total = comb(52, 5)
    out: dict[int, int] = {}
    for a in range(14):
        for b in range(14):
            for c in range(14):
                d = 5 - a - b - c
                if not 0 <= d <= 13:
                    continue
                ways = comb(13, a) * comb(13, b) * comb(13, c) * comb(13, d)
                k = max(a, b, c, d)
                out[k] = out.get(k, 0) + ways
    return {k: Decimal(v) / total for k, v in sorted(out.items())}


@lru_cache(maxsize=None)
def hcf_paytable() -> dict[int, Decimal]:
    """Flush-length pays: RTP mass split 45/30/25 over 3/4/5-card flushes,
    each rounded down -- exact return just under 96%."""
    probs = hcf_probs()
    shares = {3: Decimal("0.45"), 4: Decimal("0.30"), 5: Decimal("0.25")}
    return {k: (HOUSE * s / probs[k]).quantize(Decimal("0.01"),
                                               rounding="ROUND_DOWN")
            for k, s in shares.items()}


def hcf_rtp() -> Decimal:
    probs = hcf_probs()
    return sum(m * probs[k] for k, m in hcf_paytable().items())


def hcf_deal(server: str, client: str, nonce: int) -> list[str]:
    """5 cards, without replacement, from one 52-card deck."""
    fs = fairness.floats(server, client, nonce, HCF_CARDS)
    deck = list(range(52))
    for i in range(HCF_CARDS):
        j = i + int(Decimal(str(fs[i])) * (52 - i))
        j = min(j, 51)
        deck[i], deck[j] = deck[j], deck[i]
    return [_RANKS[c % 13] + _SUITS[c // 13] for c in deck[:HCF_CARDS]]


def hcf_flush_len(cards: list[str]) -> int:
    counts: dict[str, int] = {}
    for c in cards:
        counts[c[1]] = counts.get(c[1], 0) + 1
    return max(counts.values())
