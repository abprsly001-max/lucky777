"""Piggy Bank Blast: the Hold & Spin math is exact."""
from decimal import Decimal

from app.casino.games import holdspin as H


def test_house_holds_eight_percent_by_construction():
    rtp = H.exact_rtp()
    assert Decimal("0.90") <= rtp <= H.TARGET_RTP


def test_feature_chain_is_sane():
    # from a full grid: done; from 0 respins: frozen
    assert H._feature_stats(15, 3) == (15.0, 1.0)
    assert H._feature_stats(8, 0) == (8.0, 0.0)
    # more starting coins can only help
    e6 = H._feature_stats(6, 3)[0]
    e10 = H._feature_stats(10, 3)[0]
    assert e10 > e6 >= 6.0


def test_base_spin_is_deterministic_and_triggers_on_six():
    a = H.base_spin("s", "c", 5)
    assert a == H.base_spin("s", "c", 5)
    assert a.triggered == (len(a.coins) >= H.TRIGGER)
    for cell, v in a.coins.items():
        assert 0 <= cell < 15 and Decimal(v) > 0


def test_respin_only_fills_empty_cells():
    locked = [0, 1, 2, 3, 4, 5]
    new = H.respin("s", "c", 9, locked)
    assert all(c not in locked for c in new)
