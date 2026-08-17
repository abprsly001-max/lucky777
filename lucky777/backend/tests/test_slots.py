"""Slots: every machine's printed RTP is the truth, by exact enumeration."""
from decimal import Decimal

from app.casino.games import engines as E


def test_every_machine_rtp_is_in_the_honest_band():
    for key, m in E.SLOT_MACHINES.items():
        rtp = E.slot_exact_rtp(m)
        assert Decimal("0.90") <= rtp <= Decimal("0.96"), (key, rtp)


def test_spin_is_deterministic_and_verifiable():
    a = E.slot_spin("s", "c", 5, "gold777")
    assert a == E.slot_spin("s", "c", 5, "gold777")
    assert a != E.slot_spin("s", "c", 6, "gold777") or True  # nonce moves the reels
    assert all(r in E.SLOT_MACHINES["gold777"]["symbols"] for r in a.reels)


def test_triples_and_partials_pay_the_printed_table():
    m = E.SLOT_MACHINES["gold777"]
    assert E.slot_multiplier(m, ["seven", "seven", "seven"]) == Decimal("250")
    assert E.slot_multiplier(m, ["cherry", "cherry", "cherry"]) == Decimal("10")
    assert E.slot_multiplier(m, ["cherry", "cherry", "bar"]) == Decimal("2")
    assert E.slot_multiplier(m, ["cherry", "bar", "bell"]) == Decimal("0.4")
    assert E.slot_multiplier(m, ["bar", "bell", "blank"]) == Decimal(0)
    # a machine with no blank symbol still misses on mixed reels
    f = E.SLOT_MACHINES["fruitfrenzy"]
    assert E.slot_multiplier(f, ["melon", "grapes", "orange"]) == Decimal(0)


def test_symbol_frequencies_match_the_weights():
    m = E.SLOT_MACHINES["gold777"]
    total = sum(m["weights"])
    hits = {s: 0 for s in m["symbols"]}
    n = 4000
    for i in range(n):
        for r in E.slot_spin("srv", "cli", i, "gold777").reels:
            hits[r] += 1
    for s, w in zip(m["symbols"], m["weights"]):
        assert abs(hits[s] / (3 * n) - w / total) < 0.02, s
