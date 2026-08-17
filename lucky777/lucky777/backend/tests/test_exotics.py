"""Teasers, if-bets, reverses: the math that pays (or doesn't)."""
from decimal import Decimal

from app.core.money import to_micros
from app.sportsbook import exotics as X


# ---------------------------------------------------------------- teasers ----
def test_tease_moves_every_line_the_bettors_way():
    six = Decimal("6")
    # home -6.5 teased 6 -> -0.5; away +6.5 -> +12.5
    assert X.tease_line("spreads", "home", Decimal("-6.5"), six) == Decimal("-0.5")
    assert X.tease_line("spreads", "away", Decimal("-6.5"), six) == Decimal("12.5")
    # over 44.5 teased down to 38.5; under up to 50.5
    assert X.tease_line("totals", "over", Decimal("44.5"), six) == Decimal("38.5")
    assert X.tease_line("totals", "under", Decimal("44.5"), six) == Decimal("50.5")


def test_teased_grading():
    # home -0.5: wins by 1 covers, tie loses
    assert X.grade_teased("spreads", "home", Decimal("-0.5"), 21, 20) == "won"
    assert X.grade_teased("spreads", "home", Decimal("-0.5"), 20, 20) == "lost"
    # away +12.5: losing by 12 still covers
    assert X.grade_teased("spreads", "away", Decimal("12.5"), 30, 18) == "won"
    # totals: exactly on the teased number pushes
    assert X.grade_teased("totals", "over", Decimal("38"), 20, 18) == "push"


def test_two_team_teaser_pays_the_card():
    s = to_micros("110")
    # 2 legs at -110: win pays stake * 1.9090..
    assert X.settle_teaser(["won", "won"], 0, s) == X.payout_micros(
        s, X.american_to_decimal(-110))
    # any loss kills it
    assert X.settle_teaser(["won", "lost"], 0, s) == 0


def test_teaser_ties_reduce_and_two_legs_reduce_to_no_action():
    s = to_micros("100")
    # 3-team with a push pays as a 2-team
    assert X.settle_teaser(["won", "won", "push"], 0, s) == X.payout_micros(
        s, X.american_to_decimal(-110))
    # 2-team with a push refunds
    assert X.settle_teaser(["won", "push"], 0, s) == s
    # ...but a push never saves a loss
    assert X.settle_teaser(["lost", "push"], 0, s) == 0


# ---------------------------------------------------------------- if-bets ----
def test_if_win_chain_stops_on_a_loss_and_risks_only_one_stake():
    s = to_micros("100")
    ev = Decimal("1.91")
    # leg1 wins, leg2 loses: banked 91, stake gone on leg2 -> 91 back
    assert X.settle_if_chain([("won", ev), ("lost", ev)], s, False) == to_micros("91")
    # leg1 loses: chain dead, nothing back, and leg2 never had action
    assert X.settle_if_chain([("lost", ev), ("won", ev)], s, False) == 0
    # both win: 91 + 91 profit + the stake home
    assert X.settle_if_chain([("won", ev), ("won", ev)], s, False) == to_micros("282")


def test_if_win_vs_if_action_on_a_push():
    s = to_micros("100")
    ev = Decimal("2.0")
    # if-win: push ends the chain, stake back, leg2 no action
    assert X.settle_if_chain([("push", ev), ("won", ev)], s, False) == s
    # if-action: push rolls the stake on; leg2 wins
    assert X.settle_if_chain([("push", ev), ("won", ev)], s, True) == to_micros("200")


# ---------------------------------------------------------------- reverses ----
def test_reverse_is_every_ordered_pair():
    assert X.reverse_pairs(2) == [(0, 1), (1, 0)]
    assert len(X.reverse_pairs(3)) == 6
    assert X.reverse_cost(2, to_micros("50")) == to_micros("100")


def test_two_team_reverse_win_win():
    s = to_micros("50")
    ev = Decimal("2.0")
    # each chain: leg wins (+50), stake rolls, second wins (+50), stake home
    # = 150 per chain, two chains = 300 on 100 risked
    assert X.settle_reverse([("won", ev), ("won", ev)], s) == to_micros("300")


def test_two_team_reverse_split_limits_the_damage():
    s = to_micros("50")
    ev = Decimal("2.0")
    # A wins, B loses: chain A->B returns 50 profit then loses the stake = 50;
    # chain B->A dies at B = 0. Total 50 back on 100 risked.
    assert X.settle_reverse([("won", ev), ("lost", ev)], s) == to_micros("50")


# ------------------------------------------------------------ super teaser ----
def test_super_teaser_moves_ten_and_eight():
    ten = X.TEASER_POINTS[X.SUPER_TIER]["americanfootball"]
    assert X.tease_line("spreads", "home", Decimal("-6.5"), ten) == Decimal("3.5")
    assert X.TEASER_POINTS[X.SUPER_TIER]["basketball"] == Decimal("8")


def test_super_teaser_pays_flat_minus_140_and_ties_lose():
    s = to_micros("140")
    win = X.payout_micros(s, X.american_to_decimal(-140))
    assert X.settle_teaser(["won", "won", "won"], X.SUPER_TIER, s) == win
    # one push kills the whole ticket -- ties lose, as printed on the card
    assert X.settle_teaser(["won", "won", "push"], X.SUPER_TIER, s) == 0
    # but an abandoned game is no action, not a loss
    assert X.settle_teaser(["won", "won", "void"], X.SUPER_TIER, s) == s


def test_super_teaser_is_three_teams_only():
    assert X.teaser_price(X.SUPER_TIER, 2) is None
    assert X.teaser_price(X.SUPER_TIER, 4) is None
    assert X.teaser_price(X.SUPER_TIER, 3) is not None
