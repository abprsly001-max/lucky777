"""Golden Dragon Inferno: jackpot-ladder Hold & Win math is exact."""
from decimal import Decimal

from app.casino.games import dragon as D


def test_house_holds_eight_percent_by_construction():
    rtp = D.exact_rtp()
    assert Decimal("0.90") <= rtp <= D.TARGET_RTP


def test_ladder_is_fixed_and_ordered():
    assert D.JACKPOTS["mini"] == 15
    assert D.JACKPOTS["super"] == 400
    assert D.GRAND_MULT == 2000
    vals = [D.JACKPOTS[t] for t in ("mini", "minor", "major", "maxi", "super")]
    assert vals == sorted(vals)


def test_coin_multiplier_resolves_tiers_and_cash():
    assert D.coin_multiplier("maxi") == Decimal("100")
    assert D.coin_multiplier("2.27") == Decimal("2.27")


def test_feature_chain_is_sane():
    assert D._feature_stats(15, 3) == (15.0, 1.0)
    assert D._feature_stats(8, 0) == (8.0, 0.0)
    e6 = D._feature_stats(6, 3)[0]
    e10 = D._feature_stats(10, 3)[0]
    assert e10 > e6 >= 6.0


def test_base_spin_is_deterministic_and_triggers_on_six():
    a = D.base_spin("s", "c", 5)
    assert a == D.base_spin("s", "c", 5)
    assert a.triggered == (len(a.coins) >= D.TRIGGER)
    for cell, v in a.coins.items():
        assert 0 <= cell < 15
        assert D.coin_multiplier(v) > 0


def test_respin_only_fills_empty_cells():
    locked = [0, 1, 2, 3, 4, 5]
    new = D.respin("s", "c", 9, locked)
    assert all(c not in locked for c in new)


def test_buy_spin_always_triggers_and_prices_above_ev():
    for n in range(30):
        b = D.buy_spin("s", "c", n)
        assert b.triggered and len(b.coins) >= D.TRIGGER
        assert len(set(b.coins)) == len(b.coins)
    # price covers EV with the house's cut
    assert D.buy_cost_mult() * D.TARGET_RTP >= D.bonus_ev_per_stake()


def test_buy_spin_deterministic():
    assert D.buy_spin("s", "c", 3) == D.buy_spin("s", "c", 3)
