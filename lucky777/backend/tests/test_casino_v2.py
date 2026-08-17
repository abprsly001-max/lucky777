"""Roulette, video poker, baccarat, mines, crash: the printed math is the game."""
from decimal import Decimal

from app.casino.games import engines as E


# --------------------------------------------------------------- roulette ----
def test_roulette_rtp_is_36_37_for_every_bet():
    # enumerate all 37 pockets: every bet type returns exactly 36/37
    for kind, pick in [("straight", 17), ("red", None), ("black", None),
                       ("even", None), ("odd", None), ("low", None),
                       ("high", None), ("dozen", 1), ("column", 2)]:
        total = sum(E.roulette_pays(kind, pick, p) for p in range(37))
        assert total == Decimal(36), (kind, total)


def test_roulette_zero_beats_outside_bets():
    assert E.roulette_pays("red", None, 0) == 0
    assert E.roulette_pays("low", None, 0) == 0
    assert E.roulette_pays("straight", 0, 0) == Decimal(36)


def test_roulette_pocket_is_uniform_enough():
    hits = [0] * 37
    for n in range(7400):
        hits[E.roulette_pocket("s", "c", n)] += 1
    assert min(hits) > 100 and max(hits) < 320


# ------------------------------------------------------------ video poker ----
def C(rank: int, suit: int) -> int:
    return suit * 13 + rank


def test_video_poker_hand_ladder():
    A, J, Q, K, T = 0, 10, 11, 12, 9
    assert E.vp_evaluate([C(A,0),C(T,0),C(J,0),C(Q,0),C(K,0)])[0] == "Royal Flush"
    assert E.vp_evaluate([C(4,1),C(5,1),C(6,1),C(7,1),C(8,1)])[0] == "Straight Flush"
    assert E.vp_evaluate([C(7,0),C(7,1),C(7,2),C(7,3),C(2,0)])[0] == "Four of a Kind"
    assert E.vp_evaluate([C(7,0),C(7,1),C(7,2),C(2,3),C(2,0)])[0] == "Full House"
    assert E.vp_evaluate([C(2,2),C(5,2),C(7,2),C(9,2),C(J,2)])[0] == "Flush"
    assert E.vp_evaluate([C(A,0),C(T,1),C(J,0),C(Q,2),C(K,3)])[0] == "Straight"
    assert E.vp_evaluate([C(3,0),C(4,1),C(5,0),C(6,2),C(7,3)])[0] == "Straight"
    assert E.vp_evaluate([C(9,0),C(9,1),C(9,2),C(K,3),C(2,0)])[0] == "Three of a Kind"
    assert E.vp_evaluate([C(9,0),C(9,1),C(K,2),C(K,3),C(2,0)])[0] == "Two Pair"
    assert E.vp_evaluate([C(J,0),C(J,1),C(3,2),C(7,3),C(2,0)])[0] == "Jacks or Better"
    # a pair of tens pays nothing -- jacks or BETTER
    assert E.vp_evaluate([C(T,0),C(T,1),C(3,2),C(7,3),C(2,0)])[0] == "Nothing"


# --------------------------------------------------------------- baccarat ----
def test_baccarat_shoe_is_a_real_8_deck_permutation():
    shoe = E.baccarat_shoe("s", "c", 1)
    assert len(shoe) == 416
    assert all(shoe.count(c) == 8 for c in range(52))
    assert shoe == E.baccarat_shoe("s", "c", 1)


def test_baccarat_tableau_natural_stops_play():
    # rig a shoe: player 9 (natural) -> nobody draws
    A, EIGHT = 0, 7
    shoe = [A, 1, EIGHT, 1] + [5] * 412           # P: A+8=9, B: 2+2=4
    d = E.baccarat_deal(shoe)
    assert d["player_total"] == 9 and len(d["player"]) == 2 and len(d["banker"]) == 2
    assert d["outcome"] == "player"


def test_baccarat_payout_table():
    assert E.baccarat_pays("player", "player") == Decimal(2)
    assert E.baccarat_pays("banker", "banker") == Decimal("1.95")
    assert E.baccarat_pays("tie", "tie") == Decimal(9)
    assert E.baccarat_pays("player", "tie") == Decimal(1)   # push
    assert E.baccarat_pays("banker", "player") == Decimal(0)


def test_baccarat_edges_are_the_textbook_numbers():
    # play a few thousand fairness-dealt coups; banker should win more often
    wins = {"player": 0, "banker": 0, "tie": 0}
    for n in range(3000):
        wins[E.baccarat_deal(E.baccarat_shoe("s", "c", n))["outcome"]] += 1
    assert wins["banker"] > wins["player"] > wins["tie"]
    assert 0.06 < wins["tie"] / 3000 < 0.13


# ------------------------------------------------------------------ mines ----
def test_mines_layout_places_the_right_number_of_distinct_mines():
    for m in (1, 5, 24):
        layout = E.mines_layout("s", "c", 7, m)
        assert len(layout) == len(set(layout)) == m
        assert all(0 <= c < 25 for c in layout)
    assert E.mines_layout("s", "c", 7, 5) == E.mines_layout("s", "c", 7, 5)


def test_mines_multiplier_is_fair_odds_minus_the_edge():
    # 1 mine, 1 reveal: survive 24/25 -> fair 25/24; paid x = 0.97 * 25/24
    assert E.mines_multiplier(1, 1) == (Decimal("0.97") * 25 / 24).quantize(Decimal("0.0001"))
    # full clear with 24 mines: survive 1/25 -> pays ~24.25
    assert E.mines_multiplier(24, 1) == (Decimal("0.97") * 25).quantize(Decimal("0.0001"))
    assert E.mines_multiplier(5, 0) == Decimal(1)


def test_mines_rtp_is_one_minus_edge_for_any_stopping_rule():
    # P(survive k picks) * mult(k) == 1 - edge, for every k and mine count
    from fractions import Fraction
    for m in (1, 3, 10):
        for k in (1, 3, 5):
            p = Fraction(1)
            for i in range(k):
                p *= Fraction(25 - m - i, 25 - i)
            rtp = Decimal(p.numerator) / Decimal(p.denominator) * E.mines_multiplier(m, k)
            assert abs(rtp - Decimal("0.97")) < Decimal("0.001"), (m, k, rtp)


# ------------------------------------------------------------------ crash ----
def test_crash_point_never_below_1_and_deterministic():
    pts = [E.crash_point("s", "c", n) for n in range(500)]
    assert all(p >= Decimal("1.00") for p in pts)
    assert pts[7] == E.crash_point("s", "c", 7)


def test_crash_rtp_at_any_target_is_one_minus_edge():
    n = 20000
    for target in (Decimal("1.5"), Decimal("2"), Decimal("5")):
        wins = sum(1 for i in range(n)
                   if E.crash_point("s", "c", i) >= target)
        rtp = Decimal(wins) / n * target
        assert abs(rtp - Decimal("0.96")) < Decimal("0.03"), (target, rtp)


# ----------------------------------------------------------------- plinko ----
def test_plinko_every_board_lands_at_the_target_return():
    for rows in E.PLINKO_ROWS:
        for risk in ("low", "medium", "high"):
            rtp = E.plinko_rtp(rows, risk)
            assert Decimal("0.94") <= rtp <= Decimal("0.96"), (rows, risk, rtp)


def test_plinko_tables_are_symmetric_with_rich_rims():
    for rows in E.PLINKO_ROWS:
        for risk in ("low", "medium", "high"):
            t = E.PLINKO_TABLES[rows][risk]
            assert len(t) == rows + 1
            assert t == list(reversed(t))
            assert t[0] > t[rows // 2]      # the rim beats the middle


def test_plinko_path_is_deterministic_and_matches_bucket():
    a = E.plinko_play("s", "c", 3, 16, "high")
    assert a == E.plinko_play("s", "c", 3, 16, "high")
    assert a.bucket == sum(a.path) and len(a.path) == 16
    assert a.multiplier == E.PLINKO_TABLES[16]["high"][a.bucket]


def test_plinko_middle_buckets_dominate():
    mid = 0
    for n in range(2000):
        b = E.plinko_play("s", "c", n, 8, "low").bucket
        if 2 <= b <= 6:
            mid += 1
    assert mid / 2000 > 0.85               # binomial: the middle is destiny
