"""Sugar Blast: the tumble machine holds its percent and plays fair."""
from decimal import Decimal

from app.casino.games import tumble as T


def test_scale_is_frozen_from_calibration():
    # RTP@scale1 measured at 0.802214 over 20M spins; scale must match it
    assert T._SCALE == Decimal("1.1443")
    assert abs(T._SCALE - T.TARGET_RTP / Decimal("0.802214")) < Decimal("0.001")


def test_trigger_probability_exact():
    p = T.trigger_probability()
    assert Decimal("0.0034") < p < Decimal("0.0035")   # 1 in ~290


def test_pays_scale_and_tier():
    assert T.sym_pay("heart", 7) == 0
    assert T.sym_pay("heart", 8) == (Decimal("10") * T._SCALE).quantize(Decimal("0.0001"))
    assert T.sym_pay("heart", 12) > T.sym_pay("heart", 10) > T.sym_pay("heart", 8)
    assert T.scatter_pay(3) == 0
    assert T.scatter_pay(9) == (Decimal("100") * T._SCALE).quantize(Decimal("0.0001"))


def test_base_spin_deterministic_and_grid_shaped():
    a = T.base_spin("s", "c", 1)
    b = T.base_spin("s", "c", 1)
    assert a.grids == b.grids and a.total == b.total
    assert all(len(g) == T.CELLS for g in a.grids)
    assert a.scatters == sum(1 for s in a.grids[0] if s == "scatter")


def test_chain_pays_match_steps():
    # any spin's total must equal the sum over its recorded win steps
    for n in range(200):
        r = T.base_spin("s3", "c3", n)
        step_sum = sum(Decimal(w["pay"]) for ws in r.steps for w in ws)
        assert r.total == step_sum


def test_free_spin_bombs_multiply():
    r = T.free_spin("s2", "c2", 7)
    if r.total > 0 and r.bomb_sum > 0:
        assert T.fs_win(r) == r.total * r.bomb_sum
    assert T.fs_win(r) >= 0


def test_buy_spin_always_triggers():
    for n in range(25):
        r = T.buy_spin("s", "c", n)
        assert r.triggered and r.scatters >= 4
    assert T.buy_spin("s", "c", 3) == T.buy_spin("s", "c", 3)
    # price covers the calibrated EV with the house's cut
    assert T.BUY_COST_MULT * T.TARGET_RTP >= Decimal("49.5")


def test_seeded_engine_rtp_holds_the_house_percent():
    """Replay 6k real-engine spins on fixed seeds: the measured base-game
    return plus the exact feature term must sit near target, never above 1."""
    N = 6000
    tot = Decimal(0)
    for n in range(N):
        r = T.base_spin("rtpseedA", "rtpclientB", n)
        tot += r.total + T.scatter_pay(r.scatters)
    base = tot / N
    feature = T.trigger_probability() * T.FREE_SPINS * Decimal("3.888841") * T._SCALE
    full = base + feature
    # wide band for 6k-spin noise; deterministic seeds keep this stable
    assert Decimal("0.70") < full < Decimal("1.00")
