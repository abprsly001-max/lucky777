"""Arcade + quick table games: Keno, Limbo, Towers, Dragon Tiger, Hi-Lo.

Pure functions, no I/O. Every draw comes off the commit-reveal fairness
stream; every edge is fixed by construction and checked by tests.
"""
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from math import comb

from ...core import fairness

# ------------------------------------------------------------------- keno ----
KENO_POOL = 40
KENO_DRAWN = 10
KENO_MAX_PICKS = 10
KENO_RTP = Decimal("0.92")
KENO_CAP = Decimal("3000")          # per-tier multiplier cap


@lru_cache(maxsize=None)
def keno_hit_prob(picks: int, hits: int) -> Decimal:
    """Exact hypergeometric: P(`hits` of `picks` land in the 10 drawn)."""
    if hits > picks or hits > KENO_DRAWN:
        return Decimal(0)
    return (Decimal(comb(KENO_DRAWN, hits))
            * Decimal(comb(KENO_POOL - KENO_DRAWN, picks - hits))
            / Decimal(comb(KENO_POOL, picks)))


@lru_cache(maxsize=None)
def keno_paytable(picks: int) -> dict[int, Decimal]:
    """Multiplier per hit count, solved so the exact RTP sits at target.

    Paying tiers are the hit counts rare enough to feel like a win
    (P < 0.2); the RTP mass leans geometrically toward the top, any
    cap overflow rolls down to the easiest paying tier, and every
    multiplier rounds DOWN -- so the house never gives up its percent.
    """
    tiers: list[int] = []
    for h in range(picks, 0, -1):           # contiguous run from the top
        if keno_hit_prob(picks, h) < Decimal("0.2"):
            tiers.append(h)
        else:
            break
    tiers.reverse()
    if not tiers:                            # picks=1: the single hit pays
        tiers = [picks]
    weights = [Decimal(2) ** i for i in range(len(tiers))]
    wsum = sum(weights)
    table: dict[int, Decimal] = {}
    spill = Decimal(0)
    for h, w in zip(reversed(tiers), reversed(weights)):   # top tier first
        share = KENO_RTP * w / wsum + spill
        p = keno_hit_prob(picks, h)
        mult = share / p
        spill = Decimal(0)
        if mult > KENO_CAP:
            spill = (mult - KENO_CAP) * p
            mult = KENO_CAP
        table[h] = mult
    # leftover cap-spill lands on the lowest tier, then everything rounds down
    if spill > 0 and tiers:
        h0 = tiers[0]
        table[h0] = table[h0] + spill / keno_hit_prob(picks, h0)
    return {h: m.quantize(Decimal("0.01"), rounding="ROUND_DOWN")
            for h, m in sorted(table.items())}


def keno_rtp(picks: int) -> Decimal:
    return sum(m * keno_hit_prob(picks, h)
               for h, m in keno_paytable(picks).items())


def keno_draw(server: str, client: str, nonce: int) -> list[int]:
    """The 10 balls, via partial Fisher-Yates over 1..40."""
    fs = fairness.floats(server, client, nonce, KENO_DRAWN)
    balls = list(range(1, KENO_POOL + 1))
    for i in range(KENO_DRAWN):
        j = i + int(Decimal(str(fs[i])) * (KENO_POOL - i))
        j = min(j, KENO_POOL - 1)
        balls[i], balls[j] = balls[j], balls[i]
    return balls[:KENO_DRAWN]


# ------------------------------------------------------------------ limbo ----
LIMBO_EDGE = Decimal("0.04")
LIMBO_MIN = Decimal("1.01")
LIMBO_MAX = Decimal("10000")
_LIMBO_HOUSE = Decimal(1) - LIMBO_EDGE          # 0.96


@dataclass(frozen=True)
class LimboOutcome:
    result: Decimal        # the number that came up
    win: bool


def limbo_play(server: str, client: str, nonce: int,
               target: Decimal) -> LimboOutcome:
    """result = 0.96/U, so P(result >= t) = 0.96/t: a t-x payout returns
    exactly 96% at every target."""
    f = Decimal(str(fairness.floats(server, client, nonce, 1)[0]))
    if f <= 0:
        f = Decimal("1E-9")
    win = f <= _LIMBO_HOUSE / target
    result = min(_LIMBO_HOUSE / f, Decimal("1000000"))
    return LimboOutcome(result=result.quantize(Decimal("0.01"),
                                               rounding="ROUND_DOWN"),
                        win=win)


# ----------------------------------------------------------------- towers ----
TOWERS_ROWS = 8
TOWERS_EDGE = Decimal("0.03")
TOWERS_LEVELS = {"easy": 4, "medium": 3, "hard": 2}    # tiles per row, 1 trap


def towers_mult(level: str, rows_cleared: int) -> Decimal:
    """Cash-out multiplier after clearing `rows_cleared` rows: fair odds
    against surviving, shaved by the edge. RTP = 97% at every rung."""
    tiles = TOWERS_LEVELS[level]
    p_safe = Decimal(tiles - 1) / Decimal(tiles)
    fair = (Decimal(1) / p_safe) ** rows_cleared
    return ((Decimal(1) - TOWERS_EDGE) * fair).quantize(
        Decimal("0.0001"), rounding="ROUND_DOWN")


def towers_traps(server: str, client: str, nonce: int, level: str) -> list[int]:
    """The trap tile for each row, fixed up front from one fairness stream."""
    tiles = TOWERS_LEVELS[level]
    fs = fairness.floats(server, client, nonce, TOWERS_ROWS)
    return [min(int(Decimal(str(f)) * tiles), tiles - 1) for f in fs]


# ----------------------------------------------------------- dragon tiger ----
DT_DECKS = 8
DT_TIE_PAYS = Decimal("11")         # 11:1; main bets lose half on a tie
_RANKS = "A23456789TJQK"
_SUITS = "shdc"


def _card(idx: int) -> str:
    return _RANKS[idx % 13] + _SUITS[(idx // 13) % 4]


def card_rank(card: str) -> int:
    return _RANKS.index(card[0]) + 1        # A low = 1 .. K = 13


def dt_deal(server: str, client: str, nonce: int) -> tuple[str, str]:
    """Two cards, without replacement, from the 8-deck shoe."""
    n = 52 * DT_DECKS
    fs = fairness.floats(server, client, nonce, 2)
    a = min(int(Decimal(str(fs[0])) * n), n - 1)
    b = min(int(Decimal(str(fs[1])) * (n - 1)), n - 2)
    if b >= a:
        b += 1
    return _card(a % 52), _card(b % 52)


def dt_settle(bet: str, dragon: str, tiger: str) -> Decimal:
    """Return-per-stake (0 = lost, 1 = push-half not used, 2 = even money...).
    Main bets pay 1:1, lose HALF on a rank tie; tie pays 11:1."""
    dr, tr = card_rank(dragon), card_rank(tiger)
    if dr == tr:
        if bet == "tie":
            return DT_TIE_PAYS + 1
        return Decimal("0.5")                    # half back
    winner = "dragon" if dr > tr else "tiger"
    if bet == winner:
        return Decimal(2)
    if bet == "tie":
        return Decimal(0)
    return Decimal(0)


def dt_edge(bet: str) -> Decimal:
    """Exact edge from shoe composition (rank ties only)."""
    n = 52 * DT_DECKS
    per_rank = 4 * DT_DECKS
    p_tie = (Decimal(13) * per_rank * (per_rank - 1)
             / (Decimal(n) * (n - 1)))
    if bet == "tie":
        return Decimal(1) - p_tie * (DT_TIE_PAYS + 1)
    p_win = (Decimal(1) - p_tie) / 2
    return Decimal(1) - (p_win * 2 + p_tie * Decimal("0.5"))


# ------------------------------------------------------------------ hi-lo ----
HILO_EDGE = Decimal("0.04")
_HILO_HOUSE = Decimal(1) - HILO_EDGE


def hilo_card(server: str, client: str, nonce: int, step: int) -> str:
    """Fresh-deck draw per step (rank and suit uniform, stated in the rules)."""
    f = fairness.floats(server, client, nonce, step + 1)[step]
    idx = min(int(Decimal(str(f)) * 52), 51)
    return _card(idx)


def hilo_mult(rank: int, guess: str) -> Decimal:
    """Payout multiplier for one correct strictly-higher / strictly-lower
    call from `rank`; a tie loses, so the odds are exactly (13-r)/13 or
    (r-1)/13, shaved by the edge. 0 means the call isn't offered."""
    if guess == "higher":
        p = Decimal(13 - rank) / 13
    else:
        p = Decimal(rank - 1) / 13
    if p <= 0:
        return Decimal(0)
    return (_HILO_HOUSE / p).quantize(Decimal("0.0001"),
                                      rounding="ROUND_DOWN")
