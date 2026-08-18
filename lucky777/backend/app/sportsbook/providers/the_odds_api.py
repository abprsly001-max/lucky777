"""the-odds-api.com adapter.

Free tier is roughly 500 credits/month, which is plenty if you poll upcoming
events every few minutes rather than every second. Set LUCKY777_ODDS_API_KEY and
LUCKY777_ODDS_PROVIDER=the_odds_api to switch the book over to live prices; no
domain code changes, because everything goes through ProviderEvent.

Pricing policy: the CONSENSUS of every quoted book, not any single book. One
bookmaker's stale or fat-fingered number (a -20000 hung on a live game, a +145
where seven others say +230) would otherwise become our line, and a line that
one outlier writes is a line a sharp customer picks off. Median implied
probability per outcome is robust to exactly that.

Scraping a sportsbook's own site instead is both against their terms and a
losing fight with their anti-bot. Use a feed.
"""
from datetime import datetime, timezone
from decimal import Decimal
from statistics import median

import httpx

from .base import (
    OddsProvider, ProviderCompetition, ProviderEvent, ProviderMarket, ProviderSelection,
)

BASE = "https://api.the-odds-api.com/v4"

# their sport keys -> our display grouping
SPORT_GROUPS = {
    "soccer": ("soccer", "Soccer", "⚽"),
    "americanfootball": ("americanfootball", "Am. Football", "🏈"),
    "basketball": ("basketball", "Basketball", "🏀"),
    "baseball": ("baseball", "Baseball", "⚾"),
    "icehockey": ("icehockey", "Ice Hockey", "🏒"),
    "tennis": ("tennis", "Tennis", "🎾"),
    "mma": ("mma", "MMA", "🥊"),
    "cricket": ("cricket", "Cricket", "🏏"),
    "rugbyleague": ("rugby", "Rugby", "🏉"),
}


def _decimal_odds(price) -> Decimal:
    """Accept decimal or American price. The two never overlap: decimal odds
    live in (1, ~100); American prices are always <= -100 or >= 100."""
    p = Decimal(str(price))
    if p >= 100:
        return 1 + p / 100
    if p <= -100:
        return 1 + 100 / -p
    return p


class TheOddsApiProvider(OddsProvider):
    name = "the_odds_api"

    def __init__(self, api_key: str, regions: str = "us,uk,eu",
                 markets: str = "h2h,totals,spreads", max_sports: int = 12):
        self.api_key = api_key
        self.regions = regions
        self.markets = markets
        self.max_sports = max_sports

    def _group(self, sport_key: str) -> tuple[str, str, str]:
        for prefix, group in SPORT_GROUPS.items():
            if sport_key.startswith(prefix):
                return group
        return ("other", "Other", "🎯")

    # what a book leads with, in order. Their /sports list is alphabetical,
    # which starves soccer and tennis at any sane cap -- rank it ourselves.
    PRIORITY = ["americanfootball_nfl", "baseball_mlb", "basketball_nba",
                "basketball_wnba", "icehockey_nhl", "americanfootball_ncaaf",
                "soccer_epl", "soccer_uefa", "soccer_spain_la_liga",
                "soccer_italy_serie_a", "soccer_germany_bundesliga",
                "soccer_france_ligue_one", "soccer_usa_mls", "soccer_mexico",
                "tennis_", "mma_", "boxing_", "soccer_", "baseball_",
                "basketball_", "icehockey_", "americanfootball_"]

    def _rank(self, key: str) -> tuple[int, str]:
        for i, pref in enumerate(self.PRIORITY):
            if key.startswith(pref):
                return (i, key)
        return (len(self.PRIORITY), key)

    async def _active_sports(self, client: httpx.AsyncClient) -> list[dict]:
        r = await client.get(f"{BASE}/sports", params={"apiKey": self.api_key})
        r.raise_for_status()
        live = [s for s in r.json()
                if s.get("active") and not s.get("has_outrights")]
        live.sort(key=lambda s: self._rank(s["key"]))
        return live[: self.max_sports]

    async def fetch_events(self) -> list[ProviderEvent]:
        now = datetime.now(timezone.utc)
        out: list[ProviderEvent] = []
        async with httpx.AsyncClient(timeout=20) as client:
            for sport in await self._active_sports(client):
                sk = sport["key"]
                resp = await client.get(
                    f"{BASE}/sports/{sk}/odds",
                    params={"apiKey": self.api_key, "regions": self.regions,
                            "markets": self.markets, "oddsFormat": "decimal"},
                )
                if resp.status_code != 200:
                    continue  # quota or unsupported market for this sport
                group_key, group_name, icon = self._group(sk)
                comp = ProviderCompetition(
                    key=sk, name=sport.get("title", sk), sport_key=group_key,
                    sport_name=group_name, country=sport.get("group", ""), icon=icon,
                )
                for ev in resp.json():
                    starts = datetime.fromisoformat(
                        ev["commence_time"].replace("Z", "+00:00"))
                    if starts <= now:
                        continue      # started games belong to the scores flow
                    markets = self._markets(ev)
                    if not markets:
                        continue
                    out.append(ProviderEvent(
                        provider_id=ev["id"], competition=comp,
                        home=ev["home_team"], away=ev["away_team"],
                        starts_at=starts, markets=markets,
                    ))
        return out

    # ------------------------------------------------------------ pricing ----
    def _markets(self, ev: dict) -> list[ProviderMarket]:
        """Consensus across every quoted bookmaker.

        For each market (and line, where lines differ per book) collect every
        book's price per outcome, take the median implied probability, and use
        that. For spreads/totals, price only the CONSENSUS line -- the point
        most books are quoting -- so one book's off-market number is ignored.
        """
        books = ev.get("bookmakers") or []
        if not books:
            return []

        # quotes[(market_key, point)][outcome_name] -> [decimal odds, ...]
        quotes: dict[tuple[str, str], dict[str, list[Decimal]]] = {}
        line_votes: dict[str, dict[str, int]] = {}
        for bk in books:
            for m in bk.get("markets", []):
                key = m["key"]
                if key not in ("h2h", "totals", "spreads"):
                    continue
                for o in m.get("outcomes", []):
                    point = str(o.get("point", "")) if key != "h2h" else ""
                    if key != "h2h":
                        pt_key = point if key == "totals" else str(abs(Decimal(point or "0")))
                        line_votes.setdefault(key, {})
                        line_votes[key][pt_key] = line_votes[key].get(pt_key, 0) + 1
                    slot = quotes.setdefault((key, point), {})
                    slot.setdefault(o["name"], []).append(_decimal_odds(o["price"]))

        def consensus(prices_by_name: dict[str, list[Decimal]]) -> dict[str, Decimal]:
            out = {}
            for name, prices in prices_by_name.items():
                probs = [1 / p for p in prices]
                price = 1 / median(probs)
                # keep every price on the board bettable: a 1.00 favourite
                # crashes American conversion and pays nothing anyway
                out[name] = min(Decimal(501), max(Decimal("1.01"), price))
            return out

        result: list[ProviderMarket] = []

        # --- h2h
        h2h = quotes.get(("h2h", ""))
        if h2h and len(h2h) >= 2:
            odds = consensus(h2h)
            sels = [ProviderSelection(
                "draw" if name == "Draw"
                else "home" if name == ev["home_team"] else "away",
                name, price) for name, price in odds.items()]
            result.append(ProviderMarket(type="h2h", name="Match Result", selections=sels))

        # --- totals & spreads at the consensus line only
        for key, mtype in (("totals", "totals"), ("spreads", "spreads")):
            votes = line_votes.get(key)
            if not votes:
                continue
            best_pt = max(votes, key=lambda k: votes[k])
            if key == "totals":
                slot = quotes.get((key, best_pt))
                line = best_pt
            else:
                # spreads store home/away at mirrored points; group by magnitude
                merged: dict[str, list[Decimal]] = {}
                line = None
                for (k, point), names in quotes.items():
                    if k != key or point == "":
                        continue
                    if str(abs(Decimal(point))) != best_pt:
                        continue
                    for name, prices in names.items():
                        merged.setdefault(name, []).extend(prices)
                        if name == ev["home_team"]:
                            line = point
                slot = merged or None
            if not slot or len(slot) < 2 or line in (None, ""):
                continue
            odds = consensus(slot)
            if key == "totals":
                sels = [ProviderSelection(name.lower(), f"{name} {line}", price)
                        for name, price in odds.items()]
                result.append(ProviderMarket(type="totals", name=f"Total (O/U {line})",
                                             line=line, selections=sels))
            else:
                sels = [ProviderSelection(
                    "home" if name == ev["home_team"] else "away",
                    f"{name} {line if name == ev['home_team'] else str(-Decimal(line))}",
                    price) for name, price in odds.items()]
                result.append(ProviderMarket(type="spreads", name=f"Spread ({line})",
                                             line=line, selections=sels))
        return result

    # -------------------------------------------------------------- props ----
    PROP_KEYS = {
        "pitcher_strikeouts": ("prop:ks", "Strikeouts"),
        "batter_hits": ("prop:hits", "Hits"),
        "batter_total_bases": ("prop:tb", "Total Bases"),
        "player_points": ("prop:pts", "Points"),
        "player_rebounds": ("prop:reb", "Rebounds"),
        "player_assists": ("prop:ast", "Assists"),
        "player_pass_yds": ("prop:passyds", "Passing Yards"),
        "player_rush_yds": ("prop:rushyds", "Rushing Yards"),
        "player_reception_yds": ("prop:recyds", "Receiving Yards"),
        "player_shots_on_goal": ("prop:sog", "Shots on Goal"),
    }
    SPORT_PROPS = {
        "baseball": "pitcher_strikeouts,batter_hits,batter_total_bases",
        "basketball": "player_points,player_rebounds,player_assists",
        "americanfootball": "player_pass_yds,player_rush_yds,player_reception_yds",
        "icehockey": "player_shots_on_goal",
    }

    def _parse_props(self, payload: dict) -> list[ProviderMarket]:
        """Consensus player props from a per-event odds response."""
        quotes: dict = {}
        for bk in payload.get("bookmakers") or []:
            for m in bk.get("markets", []):
                mapped = self.PROP_KEYS.get(m["key"])
                if not mapped:
                    continue
                for o in m.get("outcomes", []):
                    player = o.get("description") or ""
                    point = str(o.get("point", ""))
                    if not player or not point:
                        continue
                    slot = quotes.setdefault((mapped, player), {})
                    pt = slot.setdefault(point, {})
                    pt.setdefault(o["name"], []).append(_decimal_odds(o["price"]))
        out: list[ProviderMarket] = []
        for ((mtype, label), player), by_point in quotes.items():
            point = max(by_point,
                        key=lambda k: sum(len(v) for v in by_point[k].values()))
            sides = by_point[point]
            if "Over" not in sides or "Under" not in sides:
                continue
            over = 1 / median([1 / x for x in sides["Over"]])
            under = 1 / median([1 / x for x in sides["Under"]])
            out.append(ProviderMarket(
                type=mtype, name=f"{player} — {label}", line=point,
                selections=[ProviderSelection("over", f"Over {point}", over),
                            ProviderSelection("under", f"Under {point}", under)]))
        return out

    async def fetch_event_props(self, sport_key: str,
                                event_provider_id: str) -> list[ProviderMarket]:
        """Per-event props call. Costs credits per market+region: pull on
        demand from Game Admin, not on every sync."""
        group = self._group(sport_key)[0]
        markets = self.SPORT_PROPS.get(group)
        if not markets:
            return []
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{BASE}/sports/{sport_key}/events/{event_provider_id}/odds",
                params={"apiKey": self.api_key, "regions": "us",
                        "markets": markets, "oddsFormat": "decimal"})
            if resp.status_code != 200:
                return []
            return self._parse_props(resp.json())

    # ------------------------------------------------------------- scores ----
    @staticmethod
    def _parse_scores(rows: list[dict]) -> dict[str, tuple[int, int, bool]]:
        """provider_id -> (home, away, completed) from a /scores response."""
        out: dict[str, tuple[int, int, bool]] = {}
        for ev in rows:
            scores = ev.get("scores") or []
            if not scores:
                continue
            by_name = {s["name"]: s.get("score") for s in scores}
            h, a = by_name.get(ev.get("home_team")), by_name.get(ev.get("away_team"))
            if h is None or a is None:
                continue
            try:
                out[ev["id"]] = (int(float(h)), int(float(a)), bool(ev.get("completed")))
            except (TypeError, ValueError):
                continue
        return out

    async def fetch_scores(self, sport_keys: list[str] | None = None,
                           days_from: int | None = None
                           ) -> dict[str, tuple[int, int, bool]]:
        """Scores for the given sports (default: every active sport).

        Cost control is the whole design: a plain call is 1 credit per sport
        and returns live games; days_from adds recently completed games at 2
        credits per sport, so the finals sweep runs on a slower clock than the
        live poll.
        """
        out: dict[str, tuple[int, int, bool]] = {}
        async with httpx.AsyncClient(timeout=20) as client:
            if sport_keys is None:
                sport_keys = [s["key"] for s in await self._active_sports(client)]
            for sk in sport_keys:
                params = {"apiKey": self.api_key}
                if days_from:
                    params["daysFrom"] = days_from
                resp = await client.get(f"{BASE}/sports/{sk}/scores", params=params)
                if resp.status_code != 200:
                    continue
                out.update(self._parse_scores(resp.json()))
        return out

    async def fetch_results(self, provider_ids: list[str]) -> dict[str, tuple[int, int]]:
        """Final scores only, for the grading flow."""
        scores = await self.fetch_scores(days_from=2)
        return {pid: (h, a) for pid, (h, a, done) in scores.items()
                if done and pid in set(provider_ids)}
