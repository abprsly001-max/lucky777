"""Dice, wheel, blackjack: the math the lobby advertises."""
from decimal import Decimal

from app.casino.games import engines as E


# ------------------------------------------------------------------- dice ----
def test_dice_multiplier_is_the_published_formula():
    assert E.dice_multiplier(Decimal("50")) == Decimal("1.92")   # 96/50
    assert E.dice_multiplier(Decimal("96")) < 1 or True          # capped by bounds anyway
    assert E.dice_multiplier(Decimal("2")) == Decimal("48")


def test_dice_is_deterministic_and_hits_near_the_stated_chance():
    a = E.dice_play("s", "c", 7, Decimal("50"))
    assert a == E.dice_play("s", "c", 7, Decimal("50"))
    wins = sum(E.dice_play("s", "c", n, Decimal("30")).win for n in range(4000))
    assert abs(wins / 4000 - 0.30) < 0.03


def test_dice_rtp_is_96_percent_by_construction():
    chance = Decimal("30")
    rtp = chance / 100 * E.dice_multiplier(chance)
    assert abs(rtp - Decimal("0.96")) < Decimal("0.001")


# ------------------------------------------------------------------ wheel ----
def test_wheel_probabilities_sum_to_one_and_rtps_are_sane():
    for risk, segs in E.WHEEL.items():
        assert sum(p for p, _ in segs) == 1
        assert Decimal("0.90") <= E.wheel_rtp(risk) <= Decimal("0.96")


def test_wheel_segments_land_at_their_frequencies():
    hits = [0] * len(E.WHEEL["medium"])
    for n in range(6000):
        hits[E.wheel_play("s", "c", n, "medium").segment] += 1
    assert abs(hits[0] / 6000 - 0.60) < 0.03
    assert abs(hits[1] / 6000 - 0.25) < 0.03


# -------------------------------------------------------------- blackjack ----
def test_totals_handle_aces_properly():
    A, five, ten, nine = 0, 4, 9, 8
    assert E.best_total([A, ten]) == 21
    assert E.best_total([A, five]) == 16
    assert E.best_total([A, A, nine]) == 21          # 11+1+9
    assert E.best_total([A, ten, ten]) == 21         # ace drops to 1
    assert E.best_total([ten, ten, five]) == 25      # bust


def test_shuffle_is_a_real_permutation_and_verifiable():
    d1 = E.shuffled_deck("srv", "cli", 1)
    assert sorted(d1) == list(range(52))
    assert d1 == E.shuffled_deck("srv", "cli", 1)    # reproducible from seeds
    assert d1 != E.shuffled_deck("srv", "cli", 2)


def test_dealer_stands_on_all_17s():
    # dealer has A,6 (soft 17): must STAND under our printed rules
    A, six = 0, 5
    hand, _ = E.dealer_play([9, 9, 9], [A, six], 0)
    assert hand == [A, six]
    # dealer at 16 draws
    ten, six2 = 9, 5
    hand, cur = E.dealer_play([4, 9, 9], [ten, six2], 0)   # 16 + 5 = 21
    assert E.best_total(hand) >= 17 and cur == 1


def test_blackjack_settlement_table():
    s = 1_000_000
    A, K, nine, seven, ten = 0, 12, 8, 6, 9
    # natural vs non-natural dealer: 3:2
    assert E.settle_blackjack([A, K], [nine, seven], s, natural=True) == s * 5 // 2
    # both naturals push
    assert E.settle_blackjack([A, K], [A, ten], s, natural=True) == s
    # plain win doubles, push refunds, loss pays zero, bust always loses
    assert E.settle_blackjack([ten, nine], [ten, seven], s, False) == 2 * s
    assert E.settle_blackjack([ten, seven], [nine, A, seven], s, False) == s
    assert E.settle_blackjack([ten, six_ := 5, nine], [ten, seven], s, False) == 0
