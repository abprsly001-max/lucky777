"""The Odds API adapter: consensus pricing against a real captured payload."""
from decimal import Decimal

from app.sportsbook.providers.the_odds_api import TheOddsApiProvider, _decimal_odds

P = TheOddsApiProvider("test-key")


def _book(key, outcomes, market="h2h", point=None):
    outs = []
    for name, price in outcomes:
        o = {"name": name, "price": price}
        if point is not None:
            o["point"] = point if name in ("Over", "Under") else point
        outs.append(o)
    return {"key": key, "title": key, "markets": [{"key": market, "outcomes": outs}]}


# a real capture from 2026-08-17: Fanatics hangs +145/-190 while seven books
# quote the Reds +210..+250. The consensus must ignore the outlier.
MLB = {
    "id": "837b77a12931b96e7f399811d7f8ca29",
    "home_team": "Cincinnati Reds", "away_team": "St. Louis Cardinals",
    "bookmakers": [
        _book("fanduel", [("Cincinnati Reds", 230), ("St. Louis Cardinals", -270)]),
        _book("mybookieag", [("Cincinnati Reds", 225), ("St. Louis Cardinals", -286)]),
        _book("fanatics", [("Cincinnati Reds", 145), ("St. Louis Cardinals", -190)]),
        _book("draftkings", [("Cincinnati Reds", 243), ("St. Louis Cardinals", -287)]),
        _book("williamhill_us", [("Cincinnati Reds", 215), ("St. Louis Cardinals", -280)]),
        _book("betrivers", [("Cincinnati Reds", 220), ("St. Louis Cardinals", -335)]),
        _book("betmgm", [("Cincinnati Reds", 250), ("St. Louis Cardinals", -325)]),
        _book("bovada", [("Cincinnati Reds", 210), ("St. Louis Cardinals", -285)]),
    ],
}

# same capture: a live Allsvenskan game where two books hang -20000
SOCCER = {
    "id": "5a522fe54ae01be40f5c1969281e05b0",
    "home_team": "BK Hacken", "away_team": "Halmstads BK",
    "bookmakers": [
        _book("fanduel", [("BK Hacken", -20000), ("Halmstads BK", 35000), ("Draw", 4000)]),
        _book("bovada", [("BK Hacken", -1500), ("Halmstads BK", 3300), ("Draw", 750)]),
        _book("draftkings", [("BK Hacken", -20000), ("Halmstads BK", 11000), ("Draw", 1500)]),
        _book("betmgm", [("BK Hacken", -10000), ("Halmstads BK", 15000), ("Draw", 1700)]),
    ],
}


def test_american_and_decimal_prices_both_parse():
    assert _decimal_odds(230) == Decimal("3.3")
    assert _decimal_odds(-270) == 1 + Decimal(100) / 270
    assert _decimal_odds("1.91") == Decimal("1.91")
    assert _decimal_odds(-20000) == Decimal("1.005")


def test_consensus_ignores_the_off_market_book():
    mkts = P._markets(MLB)
    h2h = next(m for m in mkts if m.type == "h2h")
    home = next(s for s in h2h.selections if s.key == "home")
    # seven books cluster at +210..+250 (3.10-3.50); Fanatics says 2.45.
    # the median must sit in the cluster, not get dragged toward the outlier.
    assert Decimal("3.05") < home.odds < Decimal("3.55")


def test_three_way_market_maps_draw():
    mkts = P._markets(SOCCER)
    h2h = next(m for m in mkts if m.type == "h2h")
    keys = {s.key for s in h2h.selections}
    assert keys == {"home", "away", "draw"}
    home = next(s for s in h2h.selections if s.key == "home")
    assert home.odds < Decimal("1.10")     # consensus of a nearly-decided game


def test_totals_price_only_the_consensus_line():
    ev = {
        "id": "x", "home_team": "A", "away_team": "B",
        "bookmakers": [
            _book("b1", [("Over", -104), ("Under", -127)], market="totals", point=9.5),
            _book("b2", [("Over", -110), ("Under", -110)], market="totals", point=9.5),
            _book("b3", [("Over", 200), ("Under", -280)], market="totals", point=11.5),
        ],
    }
    mkts = P._markets(ev)
    tot = next(m for m in mkts if m.type == "totals")
    assert tot.line == "9.5"               # two books vote 9.5, one votes 11.5
    assert {s.key for s in tot.selections} == {"over", "under"}


def test_scores_parse_and_grade_only_completed():
    rows = [
        {"id": "a", "home_team": "X", "away_team": "Y", "completed": True,
         "scores": [{"name": "X", "score": "5"}, {"name": "Y", "score": "3"}]},
        {"id": "b", "home_team": "P", "away_team": "Q", "completed": False,
         "scores": [{"name": "P", "score": "1"}, {"name": "Q", "score": "0"}]},
        {"id": "c", "home_team": "M", "away_team": "N", "completed": False,
         "scores": None},
    ]
    parsed = TheOddsApiProvider._parse_scores(rows)
    assert parsed["a"] == (5, 3, True)
    assert parsed["b"] == (1, 0, False)
    assert "c" not in parsed
