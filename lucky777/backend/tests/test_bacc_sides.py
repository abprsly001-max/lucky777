"""Baccarat pair side bets: 12:1 on an eight-deck shoe, edge exact."""
from fractions import Fraction

from app.casino.games import engines as E


def test_pair_edge_is_exact():
    """First two cards of a side from an 8-deck shoe: P(pair) = 31/415,
    so 12:1 returns 403/415 -- the house holds 2.89 percent."""
    p_pair = Fraction(31, 415)
    rtp = p_pair * (E.BACC_PAIR_PAY + 1)
    assert rtp == Fraction(403, 415)
    edge = 1 - float(rtp)
    assert 0.025 < edge < 0.035, edge


def test_pair_judge():
    # card = rank + 13*suit
    assert E.bacc_pair([6, 6 + 13])          # two sevens, different suits
    assert E.bacc_pair([0, 0 + 39])          # two aces
    assert not E.bacc_pair([6, 7])           # seven and eight
    # only the FIRST TWO cards count, exactly like the felt
    hand = [6, 6 + 13, 9]
    assert E.bacc_pair(hand[:2])


def test_pair_frequency_over_real_shoes():
    """Deal seeded shoes: player-pair frequency lands near 31/415."""
    hits = 0
    n = 4000
    for nonce in range(n):
        shoe = E.baccarat_shoe("s" * 64, "c" * 16, nonce)
        d = E.baccarat_deal(shoe)
        if E.bacc_pair(d["player"][:2]):
            hits += 1
    freq = hits / n
    assert 0.055 < freq < 0.095, freq        # 31/415 = 0.0747
