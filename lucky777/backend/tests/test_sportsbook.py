"""Sportsbook: odds arithmetic, grading, and settlement.

Settlement is where money moves and where bugs are unforgiving, so the grading
matrix is exhaustive rather than representative.
"""
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest

from app.sportsbook import odds as O
from app.sportsbook.settlement import grade_selection

M = lambda t, line=None: NS(type=t, line=line)          # noqa: E731
S = lambda k: NS(key=k)                                  # noqa: E731


# ------------------------------------------------------------------- odds ----
def test_decimal_american_round_trip():
    for a in (-500, -200, -110, 150, 200, 333):
        assert O.decimal_to_american(O.american_to_decimal(a)) == a


def test_american_rounds_not_truncates():
    # int(-100/0.91) truncates to -109; the real price is -110
    assert O.decimal_to_american(Decimal("1.91")) == -110
    assert O.decimal_to_american(Decimal("2.50")) == 150


def test_overround_and_hold_are_different_numbers():
    book = ["1.91", "1.91"]
    assert abs(O.overround(book) - Decimal("1.0471")) < Decimal("0.0001")
    assert abs(O.hold(book) - Decimal("0.0450")) < Decimal("0.0001")
    assert O.hold(book) < O.overround(book) - 1      # the classic conflation


def test_fair_book_has_no_hold():
    assert abs(O.hold(["2.00", "2.00"])) < Decimal("0.000001")


def test_apply_margin_produces_the_requested_overround():
    prices = O.apply_margin([Decimal("0.5"), Decimal("0.28"), Decimal("0.22")], Decimal("1.06"))
    assert abs(O.overround(prices) - Decimal("1.06")) < Decimal("0.0005")


def test_parlay_margin_compounds():
    """4.5% per leg becomes 12.9% over three legs -- the whole parlay business."""
    three = O.parlay_odds(["1.91"] * 3)
    assert abs(three - Decimal("6.9679")) < Decimal("0.0001")
    compounded = 1 - three / O.parlay_odds(["2.00"] * 3)
    assert abs(compounded - Decimal("0.1290")) < Decimal("0.001")
    assert compounded > O.hold(["1.91", "1.91"]) * 2      # strictly worse than 2x one leg


# ---------------------------------------------------------------- grading ----
@pytest.mark.parametrize("home,away,key,expected", [
    (2, 1, "home", "won"), (2, 1, "draw", "lost"), (2, 1, "away", "lost"),
    (1, 1, "draw", "won"), (1, 1, "home", "lost"),
    (0, 3, "away", "won"),
])
def test_h2h(home, away, key, expected):
    assert grade_selection(M("h2h"), S(key), home, away) == expected


@pytest.mark.parametrize("home,away,key,expected", [
    (1, 1, "home", "won"), (1, 1, "draw", "lost"), (1, 1, "away", "won"),
    (2, 0, "home", "won"), (2, 0, "draw", "won"), (2, 0, "away", "lost"),
])
def test_double_chance(home, away, key, expected):
    assert grade_selection(M("double_chance"), S(key), home, away) == expected


@pytest.mark.parametrize("home,away,line,key,expected", [
    (2, 1, "2.5", "over", "won"), (2, 1, "2.5", "under", "lost"),
    (1, 0, "2.5", "under", "won"),
    (2, 1, "3", "over", "push"), (2, 1, "3", "under", "push"),   # exact line
])
def test_totals(home, away, line, key, expected):
    assert grade_selection(M("totals", line), S(key), home, away) == expected


@pytest.mark.parametrize("home,away,line,key,expected", [
    (24, 20, "-3.5", "home", "won"), (23, 20, "-3.5", "home", "lost"),
    (23, 20, "-3", "home", "push"), (23, 20, "-3", "away", "push"),
    (20, 24, "3.5", "home", "lost"), (20, 24, "3.5", "away", "won"),
])
def test_spreads(home, away, line, key, expected):
    assert grade_selection(M("spreads", line), S(key), home, away) == expected


@pytest.mark.parametrize("home,away,key,expected", [
    (2, 1, "yes", "won"), (2, 0, "yes", "lost"),
    (2, 0, "no", "won"), (0, 0, "no", "won"),
])
def test_btts(home, away, key, expected):
    assert grade_selection(M("btts"), S(key), home, away) == expected


# ------------------------------------------------------------- settlement ----
def test_void_leg_collapses_out_of_a_parlay():
    """A voided leg becomes 1.00 -- not a loss, not a full refund."""
    factor = O.settle_factor([("won", "1.91"), ("void", "2.50"), ("won", "1.80")])
    assert factor == Decimal("1.91") * Decimal("1.80")


def test_all_void_returns_exactly_the_stake():
    assert O.settle_factor([("void", "1.91"), ("void", "2.5"), ("void", "10")]) == 1


def test_any_lost_leg_zeroes_the_parlay():
    assert O.settle_factor([("won", "5.0"), ("won", "5.0"), ("lost", "1.01")]) == 0


def test_push_returns_the_stake_on_a_single():
    assert O.result_factor("push", "1.91") == 1


def test_asian_quarter_line_halves():
    assert O.result_factor("half_won", "2.00") == Decimal("1.5")
    assert O.result_factor("half_lost", "2.00") == Decimal("0.5")


def test_unknown_result_is_an_error_not_a_silent_zero():
    with pytest.raises(ValueError):
        O.result_factor("probably_won", "2.00")


# ------------------------------------------------------------------ feed ----
@pytest.mark.asyncio
async def test_fixture_feed_is_priced_with_a_real_overround():
    from app.sportsbook.providers.fixture import FixtureProvider
    p = FixtureProvider()
    events = await p.fetch_events()
    assert len(events) > 30
    assert len({e.competition.sport_key for e in events}) >= 8
    for ev in events:
        for m in ev.markets:
            if m.type == "prop:pop":
                continue   # ladder rungs are nested, not exclusive: no overround
            book = O.overround([s.odds for s in m.selections])
            assert Decimal("1.05") < book < Decimal("1.07"), f"{m.name} at {book}"


@pytest.mark.asyncio
async def test_simulated_results_are_stable():
    """Re-grading an event must never produce a different score."""
    from app.sportsbook.providers.fixture import FixtureProvider
    p = FixtureProvider()
    ids = [e.provider_id for e in (await p.fetch_events())[:10]]
    assert await p.fetch_results(ids) == await p.fetch_results(ids)
