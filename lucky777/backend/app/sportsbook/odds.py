"""Odds arithmetic.

Decimal odds are the internal representation; American is a display format.
Everything here is Decimal -- a price that drifts by 1e-9 is a price you can
be arbitraged on.
"""
from decimal import ROUND_HALF_UP, Decimal

Q = Decimal("0.0001")


def to_decimal(x: str | Decimal) -> Decimal:
    return Decimal(str(x))


def decimal_to_american(d: Decimal | str) -> int:
    """1.91 -> -110, 2.50 -> +150.

    Round, do not truncate: int(-100/0.91) gives -109, but the price is -110.
    """
    d = to_decimal(d)
    if d <= Decimal("1.0001"):
        return -100000            # a price of ~1.00: display floor, never crash
    raw = (d - 1) * 100 if d >= 2 else Decimal(-100) / (d - 1)
    return int(raw.to_integral_value(rounding=ROUND_HALF_UP))


def american_to_decimal(a: int) -> Decimal:
    return (Decimal(1) + (Decimal(a) / 100 if a > 0 else Decimal(100) / abs(a))).quantize(Q)


def format_american(d: Decimal | str) -> str:
    a = decimal_to_american(d)
    return f"+{a}" if a > 0 else str(a)


def implied_probability(d: Decimal | str) -> Decimal:
    """Includes the bookmaker's margin -- these do NOT sum to 1 across a market."""
    return (Decimal(1) / to_decimal(d)).quantize(Decimal("0.000001"))


def overround(odds: list[Decimal | str]) -> Decimal:
    """Sum of implied probabilities. 1.0471 means a 4.71% overround."""
    return sum((implied_probability(o) for o in odds), Decimal(0))


def hold(odds: list[Decimal | str]) -> Decimal:
    """The fraction of stakes the book keeps with balanced action.

    Distinct from overround and constantly confused with it:
    two sides at 1.91 -> overround 4.71%, hold 4.50%.
    """
    o = overround(odds)
    return (Decimal(1) - Decimal(1) / o).quantize(Decimal("0.000001")) if o else Decimal(0)


def apply_margin(true_probs: list[Decimal], target_overround: Decimal) -> list[Decimal]:
    """Turn fair probabilities into sellable prices.

    Proportional method: scale every probability by the same factor. Real books
    use power or Shin methods, which load more margin onto longshots to exploit
    favourite-longshot bias. Proportional is honest and easy to reason about.
    """
    total = sum(true_probs)
    return [
        (Decimal(1) / (p / total * target_overround)).quantize(Q)
        for p in true_probs
    ]


def parlay_odds(legs: list[Decimal | str]) -> Decimal:
    """Odds multiply -- and so does the margin.

    Three legs at 1.91 pay 6.9679 where fair would be 8.00, so a 4.50% hold per
    leg compounds to 12.90% on the parlay. That is why books push them.
    """
    total = Decimal(1)
    for o in legs:
        total *= to_decimal(o)
    return total.quantize(Q)


# ---------------------------------------------------------------- settlement --
# What each graded result multiplies the stake by. A void leg becomes 1.00 and
# drops out of a parlay product -- which is exactly the correct behaviour.
RESULT_FACTORS: dict[str, callable] = {
    "won": lambda odds: odds,
    "half_won": lambda odds: (odds + 1) / 2,
    "push": lambda odds: Decimal(1),
    "void": lambda odds: Decimal(1),
    "half_lost": lambda odds: Decimal("0.5"),
    "lost": lambda odds: Decimal(0),
}


def result_factor(result: str, odds: Decimal | str) -> Decimal:
    try:
        return RESULT_FACTORS[result](to_decimal(odds))
    except KeyError:
        raise ValueError(f"unknown result {result!r}")


def settle_factor(results_and_odds: list[tuple[str, Decimal | str]]) -> Decimal:
    """Combined payout multiplier for a bet's legs."""
    total = Decimal(1)
    for result, odds in results_and_odds:
        total *= result_factor(result, odds)
    return total
