"""Video slots: the 8% house take is arithmetic, not luck."""
from decimal import Decimal

from app.casino.games import videoslots as V


def test_every_machine_holds_at_least_eight_percent():
    for key, m in V.VIDEO_SLOTS.items():
        rtp = V.exact_rtp(m)
        assert Decimal("0.90") <= rtp <= V.TARGET_RTP, (key, rtp)


def test_twenty_lines_all_span_five_reels():
    assert len(V.LINES) == 20
    assert all(len(l) == 5 and all(0 <= r <= 2 for r in l) for l in V.LINES)


def test_wilds_substitute_and_extend_runs():
    m = V.VIDEO_SLOTS["golden7s"]
    pays = {k: p for k, _, p in m["symbols"] if p}
    assert V.line_pay(m, ["seven", "wild", "seven", "K", "Q"]) == \
        Decimal(str(pays["seven"][3]))
    assert V.line_pay(m, ["wild", "wild", "wild", "wild", "wild"]) == \
        Decimal(str(pays["wild"][5]))
    # wilds never make a scatter line
    assert V.line_pay(m, ["scatter", "scatter", "scatter", "scatter", "scatter"]) == 0
    # broken run pays nothing
    assert V.line_pay(m, ["seven", "K", "seven", "seven", "seven"]) == 0


def test_spin_is_deterministic_and_shaped_right():
    a = V.spin("s", "c", 11, "aztec")
    assert a == V.spin("s", "c", 11, "aztec")
    assert len(a.grid) == 5 and all(len(col) == 3 for col in a.grid)
    total = sum(Decimal(w["pay"]) for w in a.line_wins)
    assert total == a.total_pay


def test_scatters_trigger_the_bonus():
    m = V.VIDEO_SLOTS["golden7s"]
    trig = m["free_spins"]["trigger"]
    for n in range(400):
        r = V.spin("s", "c", n, "golden7s")
        assert r.triggered == (r.scatters >= trig)


def test_bonus_buy_is_priced_at_the_house_edge_or_worse():
    for key, m in V.VIDEO_SLOTS.items():
        cost = V.buy_cost_mult(m)
        rtp_of_buy = V.bonus_ev_per_stake(m) / cost
        assert rtp_of_buy <= V.TARGET_RTP, (key, rtp_of_buy)
        assert cost >= 5, key            # a bonus never sells cheap


def test_every_machine_has_its_own_bonus_feature():
    # each machine carries its own per-spin multiplier profile, sized to its
    # spin count, and its own labelled feature — no two share a profile
    profiles = []
    for key, m in V.VIDEO_SLOTS.items():
        fs = m["free_spins"]
        assert len(fs["profile"]) == fs["count"], key
        assert fs.get("label"), key
        profiles.append(tuple(fs["profile"]))
    assert len(set(profiles)) == len(profiles), "profiles must be distinct"


def test_wild_reel_bonus_beats_the_base_spin_and_stays_exact():
    reaper = V.VIDEO_SLOTS["reaper"]
    assert reaper["free_spins"]["wild_reels"] == [2]
    # the locked wild reel makes a bonus spin richer than a base spin
    assert V._bonus_line_ev(reaper) > V._line_ev(reaper)
    # and the middle reel really comes out all wild during the bonus
    r = V.spin("s", "c", 5, "reaper", wild_reels=[2])
    assert r.grid[2] == ["wild", "wild", "wild"]
