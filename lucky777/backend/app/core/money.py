"""Integer money. No floats, ever.

1 credit == 1_000_000 micro-credits. All balances and amounts in the database
are BIGINT micro-credits. Decimal is used only at the boundaries.
"""
from decimal import Decimal, ROUND_DOWN

SCALE = Decimal(10) ** 6
MICROS_PER_CREDIT = 1_000_000


def to_micros(x: Decimal | str | int) -> int:
    return int((Decimal(str(x)) * SCALE).to_integral_value(rounding=ROUND_DOWN))


def from_micros(n: int) -> Decimal:
    return (Decimal(n) / SCALE).quantize(Decimal("0.000001"))


def fmt(n: int) -> str:
    """Human display, 2dp."""
    return f"{Decimal(n) / SCALE:,.2f}"


def payout_micros(stake_micros: int, multiplier: Decimal | str) -> int:
    """Stake x multiplier, rounded DOWN.

    Rounding direction is a house-policy decision and must be identical
    everywhere in the codebase. Down = never in the player's favour.
    """
    return int(
        (Decimal(stake_micros) * Decimal(str(multiplier))).to_integral_value(ROUND_DOWN)
    )
