"""Grand Heist: the frozen calibration must keep holding the house's 8."""
from decimal import Decimal

import pytest

from app.casino.games import heist as H


def test_scale_pins_total_return_on_target():
    raw_total = H._RAW_BASE_EV + H.p_trigger() * H._RAW_BONUS_EV
    rtp = raw_total * H._SCALE
    assert abs(rtp - H.TARGET_RTP) < Decimal("0.001")


def test_base_calibration_still_true():
    """A fresh seeded simulation must reproduce the frozen base EV. If a
    paytable or weight edit moves the machine, this fails the build."""
    ev = H.base_mc(120_000, seed="heist-base-cal")
    assert abs(ev - H._RAW_BASE_EV) / H._RAW_BASE_EV < Decimal("0.06")


def test_bonus_calibration_still_true():
    ev = H.bonus_mc(40_000, seed="heist-cal")
    assert abs(ev - H._RAW_BONUS_EV) / H._RAW_BONUS_EV < Decimal("0.12")


def test_super_calibration_and_price_order():
    ev = H.bonus_mc(20_000, seed="heist-super", super_start=True)
    assert abs(ev - H._RAW_SUPER_EV) / H._RAW_SUPER_EV < Decimal("0.15")
    # the super door costs more than the regular one, and both cost more
    # than their expected return -- the house sells nothing at a loss
    assert H.buy_cost_mult(True) > H.buy_cost_mult(False)
    assert Decimal(H.buy_cost_mult(False)) > H._RAW_BONUS_EV * H._SCALE
    assert Decimal(H.buy_cost_mult(True)) > H._RAW_SUPER_EV * H._SCALE


def test_spin_mechanics():
    s = H.spin("s" * 64, "c" * 16, 7)
    assert len(s.grid) == 5 and all(len(col) == 3 for col in s.grid)
    # base wilds all carry a one-spin multiplier from the base table
    wild_cells = [r * 3 + row for r, col in enumerate(s.grid)
                  for row, sym in enumerate(col) if sym == "wild"]
    assert set(s.new_stickies) == set(wild_cells)
    assert all(m in dict(H.BASE_MULT) for m in s.new_stickies.values())

    # bonus: pinned stickies stay, fresh wilds join with a bonus-table mult
    b = H.spin("s" * 64, "c" * 16, 8, stickies={7: 25}, bonus=True)
    assert b.grid[2][1] == "wild"          # cell 7 pinned
    assert b.stickies[7] == 25
    for cell, m in b.new_stickies.items():
        assert m in dict(H.MULT_TABLE)
        assert b.stickies[cell] == m
    assert not b.triggered                  # bonus spins never retrigger


def test_line_multiplier_is_the_sum_of_crossed_stickies():
    # hand-build a grid: middle line all crowns except a wild at reel 1
    grid = [["J", "crown", "Q"], ["K", "wild", "A"], ["J", "crown", "Q"],
            ["K", "crown", "A"], ["J", "Q", "K"]]
    wins, total = H._eval_lines(grid, {4: 10, 13: 50})   # wild cell 1*3+1=4
    mid = next(w for w in wins if w["line"] == 0)        # line 0 = middle row
    assert mid["symbol"] == "crown" and mid["count"] == 4
    assert mid["mult"] == 10                             # cell 13 is reel 4, not crossed
    base_pay = H.scaled_pays()["crown"][4]
    assert Decimal(mid["pay"]) == base_pay * 10
