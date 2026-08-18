"""Lucky 7, RPS, Darts, Prism, and the streak ladders: exact edges."""
from decimal import Decimal

from app.casino.games import quick as Q


def test_lucky7_every_bet_same_return():
    for b in ("under", "seven", "over"):
        assert Decimal("0.95") < Q.lucky7_rtp(b) < Decimal("0.96")
    assert Q.lucky7_settle("under", 5) == Decimal("2.3")
    assert Q.lucky7_settle("under", 7) == 0
    assert Q.lucky7_settle("seven", 7) == Decimal("5.75")
    assert Q.lucky7_settle("over", 12) == Decimal("2.3")


def test_rps_rules_and_edge():
    assert Q.rps_settle("rock", "scissors") == Q.RPS_WIN_PAYS
    assert Q.rps_settle("rock", "rock") == 1          # push
    assert Q.rps_settle("rock", "paper") == 0
    assert Decimal("0.96") < Q.rps_rtp() < Decimal("0.98")


def test_darts_true_odds_less_edge():
    for ring, p in Q.DARTS_RINGS:
        assert Q.darts_mult(ring) * p <= Decimal("0.96")
        assert Q.darts_mult(ring) * p > Decimal("0.95")
    # ring probabilities cover the board exactly
    assert sum(p for _, p in Q.DARTS_RINGS) == 1


def test_prism_scaled_to_target():
    rtp = Q.prism_rtp()
    assert Decimal("0.95") < rtp <= Q.PRISM_TARGET
    assert sum(p for _, p, _ in Q.PRISM_SEGMENTS) < 1   # the rest is dust


def test_ladder_mults_true_odds_less_edge():
    for game, cfg in Q.LADDERS.items():
        for lvl in cfg["levels"]:
            p = cfg["step_p"][lvl]
            for s in range(1, cfg["max_steps"][lvl] + 1):
                m = Q.ladder_mult(game, lvl, s)
                assert m * p ** s <= Decimal(1) - Q.LADDER_EDGE
                assert m * p ** s > Decimal(1) - Q.LADDER_EDGE - Decimal("0.001")


def test_draws_deterministic():
    assert Q.lucky7_roll("s", "c", 1) == Q.lucky7_roll("s", "c", 1)
    assert Q.rps_house("s", "c", 2) in Q.RPS_MOVES
    assert Q.darts_throw("s", "c", 3) == Q.darts_throw("s", "c", 3)
    assert Q.prism_spin("s", "c", 4) == Q.prism_spin("s", "c", 4)
    assert Q.ladder_step("s", "c", 5, "penalty", "normal", 0) == \
        Q.ladder_step("s", "c", 5, "penalty", "normal", 0)
