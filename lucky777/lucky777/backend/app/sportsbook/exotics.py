"""Teasers, if-bets, and action reverses.

The three classic PPH ticket types beyond straights and parlays:

TEASER   -- 2-6 legs, football/basketball spreads and totals only. Every line
            moves in the bettor's favour by the tier's points (football 6/6.5/7,
            basketball 4/4.5/5) and the whole ticket pays a fixed price from
            the table below. All legs must cover the MOVED number. Ties reduce:
            a push drops the ticket to the next size down; reduced below two
            legs, the ticket is no action.

IF-BET   -- an ordered chain of straight wagers sharing one stake. The stake
            rides leg 1; only if it WINS (if-win) or merely doesn't LOSE
            (if-action) does the same stake ride leg 2, and so on. The appeal:
            the most a player can lose on the whole chain is the single stake.

REVERSE  -- an action reverse: every ordered pair of the picked legs as
            two-leg if-action bets. N legs = N*(N-1) chains, each at the
            quoted stake, so the ticket's cost is stake * N * (N-1).

Everything here is pure arithmetic on graded leg results -- no I/O -- so the
whole module is trivially testable.
"""
from decimal import ROUND_HALF_UP, Decimal

from ..core.money import payout_micros

# ---------------------------------------------------------------- teasers ----
# tier -> points by sport group. Tier 3 is the Super Teaser: 3 teams exactly,
# monster points, flat -140 -- and TIES LOSE.
TEASER_POINTS = {
    0: {"americanfootball": Decimal("6"), "basketball": Decimal("4")},
    1: {"americanfootball": Decimal("6.5"), "basketball": Decimal("4.5")},
    2: {"americanfootball": Decimal("7"), "basketball": Decimal("5")},
    3: {"americanfootball": Decimal("10"), "basketball": Decimal("8")},
}
TEASER_LABEL = {0: "6pt/4pt", 1: "6½pt/4½pt", 2: "7pt/5pt",
                3: "Super 10pt/8pt · ties lose"}
SUPER_TIER = 3

# tier -> legs -> American price for the whole ticket (industry-standard card)
TEASER_PRICES: dict[int, dict[int, int]] = {
    0: {2: -110, 3: 160, 4: 265, 5: 400, 6: 600},
    1: {2: -120, 3: 140, 4: 240, 5: 350, 6: 500},
    2: {2: -130, 3: 120, 4: 200, 5: 300, 6: 450},
    3: {3: -140},
}

TEASEABLE_MARKETS = ("spreads", "totals")
TEASEABLE_SPORTS = tuple(TEASER_POINTS[0].keys())


def american_to_decimal(a: int) -> Decimal:
    if a > 0:
        return (Decimal(a) / 100 + 1).quantize(Decimal("0.0001"))
    return (Decimal(100) / Decimal(-a) + 1).quantize(Decimal("0.0001"))


def teaser_price(tier: int, legs: int) -> Decimal | None:
    a = TEASER_PRICES.get(tier, {}).get(legs)
    return american_to_decimal(a) if a is not None else None


def tease_line(market_type: str, key: str, line: Decimal, points: Decimal) -> Decimal:
    """The moved number, expressed in the bettor's own terms.

    Spreads: market line is the HOME handicap. Home gets line+points; away's
    own handicap is -line, so away gets -line+points. Totals: an Over teases
    DOWN (easier to clear), an Under teases UP.
    """
    if market_type == "spreads":
        return line + points if key == "home" else -line + points
    if market_type == "totals":
        return line - points if key == "over" else line + points
    raise ValueError(f"cannot tease a {market_type} market")


def grade_teased(market_type: str, key: str, teased: Decimal,
                 home: int, away: int) -> str:
    """won | lost | push against the bettor's moved number."""
    if market_type == "spreads":
        margin = (Decimal(home) + teased - Decimal(away) if key == "home"
                  else Decimal(away) + teased - Decimal(home))
        if margin == 0:
            return "push"
        return "won" if margin > 0 else "lost"
    if market_type == "totals":
        total = Decimal(home + away)
        if total == teased:
            return "push"
        over = total > teased
        return "won" if (key == "over") == over else "lost"
    raise ValueError(f"cannot grade a teased {market_type}")


def settle_teaser(results: list[str], tier: int, stake_micros: int) -> int:
    """Payout in micros.

    Standard tiers: ties reduce -- a push drops the ticket to the next size
    down, and below two live legs it refunds. The Super Teaser is harsher and
    says so on the card: TIES LOSE. A voided game (abandoned) still refunds
    the super -- a game that never happened is nobody's fault.
    """
    if any(r == "lost" for r in results):
        return 0

    if tier == SUPER_TIER:
        if any(r == "push" for r in results):
            return 0                             # ties lose, as advertised
        if any(r == "void" for r in results):
            return stake_micros                  # abandoned game: no action
        price = teaser_price(tier, len(results))
        return payout_micros(stake_micros, price) if price else stake_micros

    live = [r for r in results if r == "won"]
    if len(live) < 2:
        return stake_micros                      # no action -- money back
    price = teaser_price(tier, len(live))
    if price is None:
        # reduced to a size the card doesn't quote (can't happen with 2..6)
        return stake_micros
    return payout_micros(stake_micros, price)


# ---------------------------------------------------------------- if-bets ----
def settle_if_chain(legs: list[tuple[str, Decimal]], stake_micros: int,
                    if_action: bool) -> int:
    """Total returned to the wallet for one chain of (result, struck_odds).

    The single stake rides each leg in order. A win banks the profit and rolls
    the stake on; a push refunds the leg (if-win stops there, if-action rolls
    on); a loss eats the stake and ends the chain.
    """
    returned = 0
    for result, odds in legs:
        if result == "won":
            returned += payout_micros(stake_micros, odds) - stake_micros  # profit banked
            continue                                    # stake rolls to the next leg
        if result in ("push", "void"):
            if if_action:
                continue                                # stake rolls on
            returned += stake_micros                    # if-win: chain ends, stake back
            return returned
        return returned                                 # loss: stake gone, chain dead
    return returned + stake_micros                      # chain survived: stake comes home


def if_chain_potential(odds: list[Decimal], stake_micros: int) -> int:
    """Best case: every leg wins."""
    return settle_if_chain([("won", o) for o in odds], stake_micros, if_action=True)


# ---------------------------------------------------------------- reverses ----
def reverse_pairs(n: int) -> list[tuple[int, int]]:
    return [(i, j) for i in range(n) for j in range(n) if i != j]


def settle_reverse(legs: list[tuple[str, Decimal]], stake_micros: int) -> int:
    """Sum of every ordered two-leg if-action chain at the per-chain stake."""
    total = 0
    for i, j in reverse_pairs(len(legs)):
        total += settle_if_chain([legs[i], legs[j]], stake_micros, if_action=True)
    return total


def reverse_cost(n: int, stake_micros: int) -> int:
    return stake_micros * n * (n - 1)


def reverse_potential(odds: list[Decimal], stake_micros: int) -> int:
    return settle_reverse([("won", o) for o in odds], stake_micros)


def round_half(x: Decimal) -> Decimal:
    """Display helper: lines to the nearest half point."""
    return (x * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2
