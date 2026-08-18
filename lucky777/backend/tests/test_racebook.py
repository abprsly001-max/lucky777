"""The racebook: card math, grading, and the published payout formulas."""
import random
from decimal import Decimal

from app.core.money import to_micros
from app.racebook import engine as E
from app.racebook import fixture as F


def test_morning_line_parses_to_total_return():
    assert E.ml_decimal("7/2") == Decimal("4.5")
    assert E.ml_decimal("1/1") == Decimal("2")
    assert E.ml_decimal("1/2") == Decimal("1.5")


def test_place_and_show_pay_published_fractions():
    # 4/1 shot: win 5.0, place 1 + 4/4 = 2.0, show 1 + 4/8 = 1.5
    assert E.multiplier("win", ["4/1"]) == Decimal("5")
    assert E.multiplier("place", ["4/1"]) == Decimal("2")
    assert E.multiplier("show", ["4/1"]) == Decimal("1.5")


def test_exotics_pay_the_stated_formula_with_floors():
    # 2/1 x 3/1 exacta: 3 * 4 / 2 = 6.0
    assert E.multiplier("exacta", ["2/1", "3/1"]) == Decimal("6")
    # two heavy chalks can't pay below the floor
    assert E.multiplier("exacta", ["1/2", "1/2"]) == Decimal("1.125")


def test_payout_cap_limits_the_win_not_the_stake():
    stake = to_micros("200")
    cap = to_micros("3000")
    # 30/1 winner would pay 6200; the cap trims it to stake + 3000
    assert E.potential("win", ["30/1"], stake, cap) == to_micros("3200")
    # small ticket untouched
    assert E.potential("win", ["2/1"], to_micros("10"), cap) == to_micros("30")


def test_grading_every_ticket_type():
    finish = [4, 1, 6, 3, 2, 5]
    assert E.grade("win", [4], finish)
    assert not E.grade("win", [1], finish)
    assert E.grade("place", [1], finish)
    assert not E.grade("place", [6], finish)
    assert E.grade("show", [6], finish)
    assert E.grade("exacta", [4, 1], finish)
    assert not E.grade("exacta", [1, 4], finish)     # order matters
    assert E.grade("trifecta", [4, 1, 6], finish)
    assert not E.grade("trifecta", [4, 6, 1], finish)


def test_finish_simulation_is_a_full_permutation_and_favours_chalk():
    class R:  # tiny stand-in for the Runner rows
        def __init__(self, pn, ml):
            self.pn, self.ml = pn, ml

    field = [R(1, "1/2"), R(2, "5/1"), R(3, "20/1"), R(4, "8/1")]
    wins = {1: 0, 2: 0, 3: 0, 4: 0}
    for i in range(3000):
        order = F.simulate_finish(random.Random(i), list(field))
        assert sorted(order) == [1, 2, 3, 4]         # everyone finishes once
        wins[order[0]] += 1
    assert wins[1] > wins[2] > wins[3]               # chalk beats the longshots
