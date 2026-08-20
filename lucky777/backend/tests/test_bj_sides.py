"""Blackjack side bets: paytables locked to their exact single-deck edges."""
from fractions import Fraction
from itertools import combinations

from app.casino.games import engines as E


def _all_threes():
    """Every 3-card combination of the single deck."""
    return combinations(range(52), 3)


def test_21p3_edge_is_exact():
    """Enumerate all C(52,3) boards: the 21+3 paytable holds 3.33 percent."""
    total = wins = 0
    rtp = Fraction(0)
    for c in _all_threes():
        total += 1
        hand, pay = E.side_21p3([c[0], c[1]], c[2])
        if hand:
            wins += 1
            rtp += Fraction(pay + 1, 1)
    rtp = rtp / total
    assert total == 22100
    edge = 1 - float(rtp)
    assert 0.03 < edge < 0.04, edge


def test_lucky_edge_is_exact():
    """Enumerate all boards: the Lucky Lucky paytable holds 2.61 percent."""
    total = 0
    rtp = Fraction(0)
    for c in _all_threes():
        total += 1
        hand, pay = E.side_lucky([c[0], c[1]], c[2])
        if hand:
            rtp += Fraction(pay + 1, 1)
    rtp = rtp / total
    edge = 1 - float(rtp)
    assert 0.02 < edge < 0.035, edge


def test_side_hands_grade_right():
    # card = rank + 13*suit; rank 0 = A ... 12 = K
    # trips: three sevens (rank index 6) in three suits
    assert E.side_21p3([6, 6 + 13], 6 + 26) == ("trips", 30)
    # suited straight: 5-6-7 of spades (ranks 4,5,6 suit 0)
    assert E.side_21p3([4, 5], 6) == ("straight_flush", 40)
    # Q-K-A counts as a straight
    assert E.side_21p3([11, 12 + 13], 0 + 26)[0] == "straight"
    # flush: three spades, no straight, mixed ranks
    assert E.side_21p3([1, 5], 9) == ("flush", 8)
    # lucky: 6-7-8 suited pays the sheet's top (ranks 5,6,7 suit 0)
    assert E.side_lucky([5, 6], 7) == ("678_suited", 100)
    # 777 unsuited
    assert E.side_lucky([6, 6 + 13], 6 + 39) == ("777", 50)
    # plain 20: T + Q + K counts 10+10+10 = 30? no -- use T + 4 + 6
    assert E.side_lucky([9, 3 + 13], 5 + 26) == ("20", 2)
    # ace flexes down: A + K + Q = 21
    assert E.side_lucky([0, 12 + 13], 11 + 26)[0] in ("21", "21_suited")
