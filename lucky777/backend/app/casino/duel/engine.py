"""Duel: the player goes head-to-head against the house account.

The house is favoured, and by exactly how much is a published number rather
than a secret. Two knobs, both shown in the UI:

    house_win_prob      how often the house takes the round   (default 0.63)
    payout_multiplier   what a player win returns on the stake (default 2.0)

    RTP        = (1 - house_win_prob) * payout_multiplier
    house edge = 1 - RTP

At the defaults that is 0.37 x 2.0 = 74% RTP, a 26% house edge. That is a
punishing game -- which is exactly why it gets printed on the button. A game
can be as house-favoured as you like as long as the player is told; what it
cannot be is house-favoured while claiming otherwise.

The outcome derives from the same commit-reveal HMAC stream used everywhere
else here, so a revealed seed lets anyone recompute every round and confirm the split really was
63/37 and not something else.
"""
from dataclasses import dataclass
from decimal import Decimal

from ...core.fairness import floats


@dataclass(frozen=True)
class DuelOutcome:
    roll: Decimal          # the uniform float, to 8dp, so players can check it
    threshold: Decimal     # house wins below this
    house_wins: bool
    multiplier: Decimal    # 0 on a loss, payout_multiplier on a win


def rtp(house_win_prob: Decimal, payout_multiplier: Decimal) -> Decimal:
    return (Decimal(1) - house_win_prob) * payout_multiplier


def play(
    server_seed: str,
    client_seed: str,
    nonce: int,
    house_win_prob: Decimal,
    payout_multiplier: Decimal,
) -> DuelOutcome:
    roll = Decimal(str(floats(server_seed, client_seed, nonce, 1)[0])).quantize(Decimal("0.00000001"))
    house_wins = roll < house_win_prob
    return DuelOutcome(
        roll=roll,
        threshold=house_win_prob,
        house_wins=house_wins,
        multiplier=Decimal(0) if house_wins else payout_multiplier,
    )


def verify(server_seed: str, client_seed: str, nonce: int,
           house_win_prob: Decimal, payout_multiplier: Decimal) -> dict:
    o = play(server_seed, client_seed, nonce, house_win_prob, payout_multiplier)
    return {
        "roll": str(o.roll),
        "threshold": str(o.threshold),
        "house_wins": o.house_wins,
        "multiplier": str(o.multiplier),
        "rule": f"house wins when roll < {o.threshold}",
    }
