"""Offline fixture feed: a full book across every major sport, no API key.

NOTE ON RANDOMNESS: this module uses `random`, and that is fine, because it
generates *demo fixtures and prices* -- never a game outcome. Anything that
decides who wins money goes through `core.fairness` and `secrets`. Keeping that
line bright is the whole point of putting them in separate modules.

Prices are built the honest way: pick true probabilities, then apply an
overround. So the vig in this book is real and measurable rather than decorative.
"""
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from ..odds import apply_margin
from .base import (
    OddsProvider, ProviderCompetition, ProviderEvent, ProviderMarket, ProviderSelection,
)

# sport_key, sport_name, icon, competition_key, competition_name, country,
# three_way, teams
CATALOG = [
    ("soccer", "Soccer", "⚽", "epl", "Premier League", "England", True, [
        "Arsenal", "Liverpool", "Manchester City", "Chelsea", "Tottenham",
        "Manchester United", "Newcastle", "Aston Villa", "Brighton", "West Ham"]),
    ("soccer", "Soccer", "⚽", "laliga", "La Liga", "Spain", True, [
        "Real Madrid", "Barcelona", "Atlético Madrid", "Athletic Club",
        "Real Sociedad", "Villarreal", "Real Betis", "Sevilla"]),
    ("soccer", "Soccer", "⚽", "ucl", "Champions League", "Europe", True, [
        "Bayern Munich", "Real Madrid", "Manchester City", "PSG", "Inter",
        "Barcelona", "Arsenal", "Borussia Dortmund"]),
    ("soccer", "Soccer", "⚽", "mls", "MLS", "USA", True, [
        "Inter Miami", "LAFC", "Seattle Sounders", "Atlanta United",
        "Columbus Crew", "Philadelphia Union"]),
    ("americanfootball", "Am. Football", "🏈", "nfl", "NFL", "USA", False, [
        "Kansas City Chiefs", "San Francisco 49ers", "Baltimore Ravens", "Buffalo Bills",
        "Philadelphia Eagles", "Detroit Lions", "Dallas Cowboys", "Miami Dolphins",
        "Green Bay Packers", "Cincinnati Bengals"]),
    ("americanfootball", "Am. Football", "🏈", "ncaaf", "NCAA Football", "USA", False, [
        "Georgia", "Michigan", "Alabama", "Ohio State", "Texas", "Oregon"]),
    ("basketball", "Basketball", "🏀", "nba", "NBA", "USA", False, [
        "Boston Celtics", "Denver Nuggets", "Milwaukee Bucks", "Phoenix Suns",
        "Los Angeles Lakers", "Golden State Warriors", "Miami Heat",
        "New York Knicks", "Dallas Mavericks", "Oklahoma City Thunder"]),
    ("basketball", "Basketball", "🏀", "euroleague", "EuroLeague", "Europe", False, [
        "Real Madrid", "Olympiacos", "Panathinaikos", "Fenerbahçe", "Barcelona"]),
    ("baseball", "Baseball", "⚾", "mlb", "MLB", "USA", False, [
        "Los Angeles Dodgers", "New York Yankees", "Atlanta Braves", "Houston Astros",
        "Philadelphia Phillies", "Baltimore Orioles", "Texas Rangers", "Seattle Mariners"]),
    ("icehockey", "Ice Hockey", "🏒", "nhl", "NHL", "USA", False, [
        "Colorado Avalanche", "Edmonton Oilers", "Boston Bruins", "Florida Panthers",
        "Toronto Maple Leafs", "Vegas Golden Knights", "New York Rangers", "Dallas Stars"]),
    ("tennis", "Tennis", "🎾", "atp", "ATP Tour", "World", False, [
        "Alcaraz", "Sinner", "Djokovic", "Medvedev", "Zverev", "Rublev", "Fritz", "Ruud"]),
    ("tennis", "Tennis", "🎾", "wta", "WTA Tour", "World", False, [
        "Świątek", "Sabalenka", "Gauff", "Rybakina", "Pegula", "Vondroušová"]),
    ("mma", "MMA", "🥊", "ufc", "UFC", "World", False, [
        "Makhachev", "Topuria", "O'Malley", "Pereira", "Edwards", "Du Plessis",
        "Volkanovski", "Adesanya"]),
    ("cricket", "Cricket", "🏏", "ipl", "IPL", "India", False, [
        "Mumbai Indians", "Chennai Super Kings", "Royal Challengers", "Kolkata Knight Riders",
        "Rajasthan Royals", "Gujarat Titans"]),
    ("rugby", "Rugby", "🏉", "sixnations", "Six Nations", "Europe", True, [
        "Ireland", "France", "England", "Scotland", "Wales", "Italy"]),
    ("esports", "Esports", "🎮", "cs2", "CS2 Majors", "World", False, [
        "NAVI", "FaZe", "Vitality", "G2", "Spirit", "MOUZ"]),
    ("esports", "Esports", "🎮", "lol", "LoL Worlds", "World", False, [
        "T1", "Gen.G", "JDG", "BLG", "G2 Esports", "Fnatic"]),
]

# typical total lines by sport
TOTALS = {
    "soccer": ["2.5", "3.5"], "americanfootball": ["44.5", "47.5"],
    "basketball": ["215.5", "224.5"], "baseball": ["8.5"], "icehockey": ["5.5"],
    "tennis": ["22.5"], "mma": ["2.5"], "cricket": ["165.5"],
    "rugby": ["45.5"], "esports": ["2.5"],
}
SPREADS = {
    "americanfootball": ["-3.5", "-6.5"], "basketball": ["-4.5", "-7.5"],
    "baseball": ["-1.5"], "icehockey": ["-1.5"], "rugby": ["-6.5"],
}


class FixtureProvider(OddsProvider):
    """Deterministic for a given seed, so dev and tests see the same book."""

    name = "fixture"

    def __init__(self, seed: int = 20260814, events_per_competition: int = 3,
                 overround: Decimal = Decimal("1.06")):
        self.seed = seed
        self.per_comp = events_per_competition
        self.overround = overround

    async def fetch_events(self) -> list[ProviderEvent]:
        rng = random.Random(self.seed)
        now = datetime.now(timezone.utc)
        out: list[ProviderEvent] = []

        for (sport_key, sport_name, icon, comp_key, comp_name,
             country, three_way, teams) in CATALOG:
            comp = ProviderCompetition(
                key=comp_key, name=comp_name, sport_key=sport_key,
                sport_name=sport_name, country=country, icon=icon,
            )
            pool = list(teams)
            rng.shuffle(pool)
            for i in range(min(self.per_comp, len(pool) // 2)):
                home, away = pool[i * 2], pool[i * 2 + 1]
                starts = now + timedelta(hours=rng.randint(2, 168), minutes=rng.choice([0, 15, 30, 45]))
                out.append(ProviderEvent(
                    provider_id=f"{comp_key}:{home}:{away}:{i}".replace(" ", "_"),
                    competition=comp, home=home, away=away, starts_at=starts,
                    markets=self._markets(rng, sport_key, home, away, three_way),
                ))
        return out

    # ---------------------------------------------------------------- markets
    def _price(self, rng: random.Random, probs: list[float]) -> list[Decimal]:
        return apply_margin([Decimal(str(p)) for p in probs], self.overround)

    def _markets(self, rng, sport_key, home, away, three_way) -> list[ProviderMarket]:
        markets: list[ProviderMarket] = []

        # ---- match result
        if three_way:
            h = rng.uniform(0.28, 0.58)
            d = rng.uniform(0.18, 0.30)
            a = max(0.10, 1 - h - d)
            prices = self._price(rng, [h, d, a])
            markets.append(ProviderMarket(
                type="h2h", name="Match Result",
                selections=[
                    ProviderSelection("home", home, prices[0]),
                    ProviderSelection("draw", "Draw", prices[1]),
                    ProviderSelection("away", away, prices[2]),
                ]))
            # double chance, derived from the same true probabilities
            dc = self._price(rng, [h + d, h + a, d + a])
            markets.append(ProviderMarket(
                type="double_chance", name="Double Chance",
                selections=[
                    ProviderSelection("home", f"{home} or Draw", dc[0]),
                    ProviderSelection("draw", f"{home} or {away}", dc[1]),
                    ProviderSelection("away", f"{away} or Draw", dc[2]),
                ]))
            btts = rng.uniform(0.42, 0.62)
            bp = self._price(rng, [btts, 1 - btts])
            markets.append(ProviderMarket(
                type="btts", name="Both Teams To Score",
                selections=[ProviderSelection("yes", "Yes", bp[0]),
                            ProviderSelection("no", "No", bp[1])]))
        else:
            h = rng.uniform(0.32, 0.68)
            prices = self._price(rng, [h, 1 - h])
            markets.append(ProviderMarket(
                type="h2h", name="Moneyline",
                selections=[ProviderSelection("home", home, prices[0]),
                            ProviderSelection("away", away, prices[1])]))

        # ---- totals
        for line in TOTALS.get(sport_key, []):
            o = rng.uniform(0.44, 0.56)
            p = self._price(rng, [o, 1 - o])
            markets.append(ProviderMarket(
                type="totals", name=f"Total (O/U {line})", line=line,
                selections=[ProviderSelection("over", f"Over {line}", p[0]),
                            ProviderSelection("under", f"Under {line}", p[1])]))

        # ---- player props (graded by the desk: stats aren't in a score feed)
        markets.extend(self._props(rng, sport_key, home, away))

        # ---- spreads / handicap
        for line in SPREADS.get(sport_key, []):
            o = rng.uniform(0.45, 0.55)
            p = self._price(rng, [o, 1 - o])
            other = line[1:] if line.startswith("-") else f"-{line}"
            markets.append(ProviderMarket(
                type="spreads", name=f"Spread ({line})", line=line,
                selections=[ProviderSelection("home", f"{home} {line}", p[0]),
                            ProviderSelection("away", f"{away} +{other}", p[1])]))

        return markets

    # ------------------------------------------------------------------ props
    _SURNAMES = ["Alvarez", "Brooks", "Carter", "Diaz", "Ellis", "Flores",
                 "Griffin", "Hayes", "Ibarra", "Jenkins", "Kane", "Lopez",
                 "Morales", "Nunez", "Ortiz", "Parker", "Quinn", "Reyes",
                 "Silva", "Torres", "Vega", "Walker", "Young", "Zimmer"]

    _PROP_MENU = {
        "baseball": [("prop:ks", "Strikeouts", (4.5, 8.5), 2, True),
                     ("prop:hits", "Hits", (0.5, 1.5), 3, False),
                     ("prop:tb", "Total Bases", (1.5, 2.5), 2, False),
                     ("prop:hrr", "Hits + Runs + RBIs", (1.5, 3.5), 2, False)],
        "basketball": [("prop:pts", "Points", (18.5, 32.5), 4, True),
                       ("prop:reb", "Rebounds", (6.5, 12.5), 2, False),
                       ("prop:ast", "Assists", (4.5, 9.5), 2, False)],
        "americanfootball": [("prop:passyds", "Passing Yards", (215.5, 285.5), 1, True),
                             ("prop:rushyds", "Rushing Yards", (45.5, 95.5), 2, False),
                             ("prop:recyds", "Receiving Yards", (40.5, 90.5), 2, False)],
        "icehockey": [("prop:sog", "Shots on Goal", (2.5, 4.5), 3, False)],
    }

    def _player(self, rng: random.Random, team: str) -> str:
        abbr = "".join(w[0] for w in team.split()[:3]).upper()
        first = chr(rng.randint(ord("A"), ord("Z")))
        return f"{first}. {rng.choice(self._SURNAMES)} ({abbr})"

    def _props(self, rng, sport_key, home, away) -> list[ProviderMarket]:
        menu = self._PROP_MENU.get(sport_key)
        if not menu:
            return []
        out: list[ProviderMarket] = []
        for mtype, label, (lo, hi), count, pops in menu:
            for i in range(count):
                team = home if i % 2 == 0 else away
                player = self._player(rng, team)
                line = round(rng.uniform(lo, hi) * 2) / 2
                if line == int(line):
                    line += 0.5                      # keep O/U unpushable
                o = rng.uniform(0.44, 0.56)
                prices = self._price(rng, [o, 1 - o])
                out.append(ProviderMarket(
                    type=mtype, name=f"{player} — {label}", line=str(line),
                    selections=[
                        ProviderSelection("over", f"Over {line}", prices[0]),
                        ProviderSelection("under", f"Under {line}", prices[1]),
                    ]))
                # the target ladder: hit the number or better, rising payouts
                if pops and i < 2:
                    base = int(line + 0.5)
                    over_odds = prices[0]
                    step = Decimal(str(rng.uniform(2.0, 2.6)))
                    rungs = []
                    for j, bump in enumerate([0, 2, 5] if base < 40 else [0, 20, 45]):
                        target = base + bump
                        odds = (over_odds * (step ** j)).quantize(Decimal("0.01"))
                        rungs.append(ProviderSelection(
                            f"t{target}", f"{target}+", odds))
                    out.append(ProviderMarket(
                        type="prop:pop", name=f"{player} — {label} Pops",
                        line=str(base), selections=rungs))
        return out

    # ---------------------------------------------------------------- results
    async def fetch_results(self, provider_ids: list[str]) -> dict[str, tuple[int, int]]:
        """Simulate final scores. Seeded per event id so a result never changes
        once produced -- re-grading the same event must be stable."""
        out = {}
        for pid in provider_ids:
            rng = random.Random(f"{self.seed}:{pid}")
            sport = pid.split(":")[0]
            if sport in ("nba", "euroleague"):
                out[pid] = (rng.randint(95, 130), rng.randint(95, 130))
            elif sport in ("nfl", "ncaaf"):
                out[pid] = (rng.randint(10, 38), rng.randint(10, 38))
            elif sport in ("ipl",):
                out[pid] = (rng.randint(140, 210), rng.randint(140, 210))
            elif sport in ("mlb", "nhl"):
                out[pid] = (rng.randint(0, 8), rng.randint(0, 8))
            elif sport in ("atp", "wta", "ufc", "cs2", "lol"):
                a = rng.randint(0, 3)
                out[pid] = (a, 3 - a if a < 3 else rng.randint(0, 2))
            else:  # soccer, rugby
                out[pid] = (rng.randint(0, 4), rng.randint(0, 4))
        return out
