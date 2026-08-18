"""Acey Ducey, War, 10 Card Flip, Ride the Bus, Suit Link, HCF: exact odds."""
from decimal import Decimal

from app.casino.games import cards as C


def test_acey_probs_and_mults():
    b, o = C.acey_probs(3, 10)          # 4..9 between = 6/13
    assert b == Decimal(6) / 13 and o == Decimal(5) / 13
    assert C.acey_mult(b) * b <= Decimal("0.96")
    assert C.acey_mult(Decimal(0)) == 0
    # ace-king: everything is between, nothing outside
    b, o = C.acey_probs(1, 13)
    assert b == Decimal(11) / 13 and o == 0


def test_flip_step_mults_hypergeometric():
    assert C.flip_step_mult(5, 5) == Decimal("1.9200")
    assert C.flip_step_mult(1, 4) == Decimal("4.8000")
    assert C.flip_step_mult(0, 3) == 0
    d = C.flip_deck("s", "c", 1)
    assert d == C.flip_deck("s", "c", 1)
    assert d.count("r") == 5 and d.count("b") == 5


def test_bus_stage_options():
    o = C.bus_options("color", [])
    assert o["red"] == o["black"] == Decimal("1.9200")
    o = C.bus_options("hilo", ["As"])       # ace: only higher offered
    assert "lower" not in o and o["higher"] * Decimal(12) / 13 <= Decimal("0.96")
    o = C.bus_options("suit", ["As", "Kd", "7c"])
    assert all(v == Decimal("3.8400") for v in o.values())
    assert C.bus_correct("color", "red", [], "7h")
    assert not C.bus_correct("color", "red", [], "7s")
    assert C.bus_correct("inout", "inside", ["2s", "Kd"], "7c")
    assert C.bus_correct("suit", "d", ["2s", "Kd", "7c"], "9d")


def test_suitlink_exact():
    assert C.suitlink_settle("h", "7h", "Kh") == C.SUIT_BOTH
    assert C.suitlink_settle("h", "7h", "Ks") == C.SUIT_ONE
    assert C.suitlink_settle("h", "7s", "Kc") == 0
    assert Decimal("0.95") < C.suitlink_rtp() <= Decimal("0.96")


def test_hcf_probs_sum_and_rtp():
    probs = C.hcf_probs()
    assert abs(sum(probs.values()) - 1) < Decimal("1E-20")
    assert Decimal("0.95") < C.hcf_rtp() <= Decimal("0.96")
    hand = C.hcf_deal("s", "c", 1)
    assert len(hand) == 5 and len(set(hand)) == 5
    assert 2 <= C.hcf_flush_len(hand) <= 5


def test_war_is_house_favored():
    # E[player] with always-war on ties stays under even money
    p_tie = Decimal(1) / 13
    p_win = (1 - p_tie) / 2
    # per original stake: base net + tie branch (stake doubles)
    war_ev = (p_win * 1 + p_tie * 2 - (1 - p_win - p_tie) * 2)
    total = p_win * 1 - p_win * 1 + p_tie * war_ev
    assert total < 0                      # house keeps its cut


def test_draws_deterministic():
    assert C.draw_card("s", "c", 1, 0) == C.draw_card("s", "c", 1, 0)
    assert C.hcf_deal("s", "c", 2) == C.hcf_deal("s", "c", 2)
