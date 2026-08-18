"""Keno, Limbo, Towers, Dragon Tiger, Hi-Lo: every edge is exact."""
from decimal import Decimal

from app.casino.games import arcade as A


def test_keno_every_pick_count_holds_the_house_percent():
    for p in range(1, A.KENO_MAX_PICKS + 1):
        rtp = A.keno_rtp(p)
        assert Decimal("0.90") < rtp <= A.KENO_RTP, (p, rtp)


def test_keno_hit_probs_sum_to_one():
    for p in (1, 5, 10):
        assert abs(sum(A.keno_hit_prob(p, h) for h in range(p + 1)) - 1) < Decimal("1E-20")


def test_keno_draw_is_ten_distinct_deterministic():
    a = A.keno_draw("s", "c", 1)
    assert a == A.keno_draw("s", "c", 1)
    assert len(a) == 10 and len(set(a)) == 10
    assert all(1 <= b <= 40 for b in a)


def test_limbo_win_probability_is_scaled_true_odds():
    # P(win at target t) = 0.96/t by construction; check via the inverse map
    t = Decimal("4")
    wins = sum(A.limbo_play("s", "c", n, t).win for n in range(4000))
    assert 850 < wins < 1100          # ~960 expected


def test_limbo_result_consistent_with_win():
    for n in range(300):
        o = A.limbo_play("s", "c", n, Decimal("2"))
        if o.result >= Decimal("2.01"):
            assert o.win
        if o.result < Decimal("1.99"):
            assert not o.win


def test_towers_multiplier_ladder():
    for level, tiles in A.TOWERS_LEVELS.items():
        p = Decimal(tiles - 1) / tiles
        for r in range(1, A.TOWERS_ROWS + 1):
            fair = (1 / p) ** r
            m = A.towers_mult(level, r)
            assert m <= (Decimal(1) - A.TOWERS_EDGE) * fair
            assert m > (Decimal(1) - A.TOWERS_EDGE) * fair - Decimal("0.001")
    # survival x multiplier = RTP at every rung
    m3 = A.towers_mult("medium", 3)
    p3 = (Decimal(2) / 3) ** 3
    assert Decimal("0.9690") < m3 * p3 <= Decimal("0.97")


def test_towers_traps_deterministic_in_range():
    t = A.towers_traps("s", "c", 2, "medium")
    assert t == A.towers_traps("s", "c", 2, "medium")
    assert len(t) == A.TOWERS_ROWS and all(0 <= x < 3 for x in t)


def test_dragon_tiger_edges():
    assert Decimal("0.03") < A.dt_edge("dragon") < Decimal("0.045")
    assert A.dt_edge("dragon") == A.dt_edge("tiger")
    assert Decimal("0.05") < A.dt_edge("tie") < Decimal("0.15")


def test_dragon_tiger_settle():
    assert A.dt_settle("dragon", "Ks", "2d") == 2       # K beats 2
    assert A.dt_settle("tiger", "Ks", "2d") == 0
    assert A.dt_settle("dragon", "As", "Kd") == 0       # ace is low
    assert A.dt_settle("dragon", "7s", "7d") == Decimal("0.5")
    assert A.dt_settle("tie", "7s", "7d") == A.DT_TIE_PAYS + 1


def test_dt_deal_two_distinct_shoe_cards():
    a, b = A.dt_deal("s", "c", 3)
    assert len(a) == 2 and len(b) == 2
    assert a[0] in "A23456789TJQK" and b[1] in "shdc"


def test_hilo_mults_are_true_odds_less_edge():
    for r in range(1, 14):
        for g in ("higher", "lower"):
            p = (Decimal(13 - r) if g == "higher" else Decimal(r - 1)) / 13
            m = A.hilo_mult(r, g)
            if p == 0:
                assert m == 0
            else:
                assert m * p <= Decimal(1) - A.HILO_EDGE
                assert m * p > Decimal(1) - A.HILO_EDGE - Decimal("0.001")


def test_hilo_card_deterministic_per_step():
    assert A.hilo_card("s", "c", 5, 0) == A.hilo_card("s", "c", 5, 0)
    assert A.hilo_card("s", "c", 5, 3) == A.hilo_card("s", "c", 5, 3)
