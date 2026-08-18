"""Player props: automatic grading off a stats feed.

The odds feed never carries player box scores, so props grade from a separate
stats source. The contract that keeps the desk hands-off:

  1. When an event ends, the grader pulls the box score and settles every prop
     it can match to a player stat.
  2. Anything still open GRADE_VOID_HOURS after full time voids itself and
     refunds the stake. Nothing ever waits on a human.

The fixture feed pairs with a deterministic stats generator so the whole loop
runs in dev; the real feed pairs with ESPN's public box scores.
"""
import random
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from .models import Competition, Event, Market, Selection, Sport

GRADE_VOID_HOURS = 24

# the label in "Player — Label" / "Player — Label Pops" -> the stat we need
LABEL_TO_STAT = {
    "Strikeouts": "ks", "Hits": "hits", "Total Bases": "tb",
    "Hits + Runs + RBIs": "hrr",
    "Points": "pts", "Rebounds": "reb", "Assists": "ast",
    "Passing Yards": "passyds", "Rushing Yards": "rushyds",
    "Receiving Yards": "recyds", "Shots on Goal": "sog",
}


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z ]", "", s.lower()).strip()


def parse_market(market: Market) -> tuple[str, str] | None:
    """'J. Diaz (RED) — Strikeouts [Pops]' -> (player, stat_key)."""
    if "—" not in market.name:
        return None
    player, label = [x.strip() for x in market.name.split("—", 1)]
    player = re.sub(r"\s*\([A-Z0-9]+\)\s*$", "", player)
    label = re.sub(r"\s*Pops$", "", label).strip()
    stat = LABEL_TO_STAT.get(label)
    return (player, stat) if stat else None


def grade_prop_market(market: Market, sels: list[Selection], actual: Decimal) -> None:
    if market.type == "prop:pop":
        for x in sels:
            x.result = "won" if actual >= Decimal(x.key[1:]) else "lost"
            x.status = "settled"
    else:
        line = Decimal(market.line or "0")
        for x in sels:
            if actual == line:
                x.result = "push"
            else:
                x.result = "won" if (x.key == "over") == (actual > line) else "lost"
            x.status = "settled"
    market.status = "settled"


def void_prop_market(market: Market, sels: list[Selection]) -> None:
    for x in sels:
        x.result, x.status = "void", "settled"
    market.status = "settled"


# ------------------------------------------------------------------ stats ----
class FixtureStats:
    """Deterministic per player+event: the demo book grades itself."""

    name = "fixture"

    async def player_stats(self, sport_key: str, ev: Event
                           ) -> dict[str, dict[str, Decimal]] | None:
        rng_of = lambda p: random.Random(f"stat:{ev.provider_id}:{p}")
        ranges = {"ks": (2, 12), "hits": (0, 4), "tb": (0, 6), "hrr": (0, 6),
                  "pts": (8, 42), "reb": (2, 16), "ast": (1, 13),
                  "passyds": (140, 360), "rushyds": (20, 140),
                  "recyds": (15, 130), "sog": (0, 7)}
        # stats are generated lazily per requested player via __missing__
        class Lazy(dict):
            def __missing__(self, player):
                rng = rng_of(player)
                self[player] = {k: Decimal(rng.randint(lo, hi))
                                for k, (lo, hi) in ranges.items()}
                return self[player]
        return Lazy()


class EspnStats:
    """Box scores from ESPN's public site API. Free, no key, best-effort —
    the auto-void backstop covers anything it cannot match."""

    name = "espn"
    PATHS = {"baseball": ("baseball", "mlb"), "basketball": ("basketball", "nba"),
             "americanfootball": ("football", "nfl"),
             "icehockey": ("hockey", "nhl")}
    # ESPN stat labels -> ours, per sport group
    STAT_KEYS = {
        "baseball": {"strikeouts": "ks", "hits": "hits", "totalBases": "tb"},
        "basketball": {"points": "pts", "rebounds": "reb", "assists": "ast"},
        "americanfootball": {"passingYards": "passyds", "rushingYards": "rushyds",
                             "receivingYards": "recyds"},
        "icehockey": {"shotsTotal": "sog"},
    }

    async def player_stats(self, sport_key: str, ev: Event
                           ) -> dict[str, dict[str, Decimal]] | None:
        import httpx
        path = self.PATHS.get(sport_key)
        if not path:
            return None
        day = ev.starts_at.strftime("%Y%m%d")
        base = f"https://site.api.espn.com/apis/site/v2/sports/{path[0]}/{path[1]}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                sb = await client.get(f"{base}/scoreboard", params={"dates": day})
                if sb.status_code != 200:
                    return None
                game_id = self._match_game(sb.json(), ev)
                if not game_id:
                    return None
                summary = await client.get(f"{base}/summary", params={"event": game_id})
                if summary.status_code != 200:
                    return None
                return self.parse_boxscore(summary.json(), sport_key)
        except Exception:                                    # noqa: BLE001
            return None                # backstop void handles persistent failures

    @staticmethod
    def _match_game(scoreboard: dict, ev: Event) -> str | None:
        want = {norm_name(ev.home), norm_name(ev.away)}
        for game in scoreboard.get("events", []):
            comp = (game.get("competitions") or [{}])[0]
            names = {norm_name(c.get("team", {}).get("displayName", ""))
                     for c in comp.get("competitors", [])}
            if want <= names or len(want & names) == 2:
                return str(game.get("id"))
        return None

    @classmethod
    def parse_boxscore(cls, summary: dict, sport_key: str
                       ) -> dict[str, dict[str, Decimal]]:
        keymap = cls.STAT_KEYS.get(sport_key, {})
        out: dict[str, dict[str, Decimal]] = {}
        for team in (summary.get("boxscore") or {}).get("players", []):
            for block in team.get("statistics", []):
                labels = block.get("keys") or block.get("names") or []
                for ath in block.get("athletes", []):
                    name = norm_name(ath.get("athlete", {}).get("displayName", ""))
                    vals = ath.get("stats", [])
                    for label, raw in zip(labels, vals):
                        stat = keymap.get(label.split(".")[-1])
                        if not stat or raw in ("", "--"):
                            continue
                        try:
                            v = Decimal(str(raw).split("/")[0])
                        except Exception:                    # noqa: BLE001
                            continue
                        out.setdefault(name, {})[stat] = v
        # composite: hits + runs + rbis when the pieces exist
        return out


def get_stats_provider():
    if settings.odds_provider == "the_odds_api" and settings.odds_api_key:
        return EspnStats()
    return FixtureStats()


# ------------------------------------------------------------ the grader ----
async def auto_grade_props(session: AsyncSession) -> dict:
    """Grade every open prop on an ended event; void what the feed can't
    answer after the deadline. Called from the background clock."""
    from .settlement import settle_bets

    rows = (await session.execute(
        select(Market, Event).join(Event, Event.id == Market.event_id)
        .where(Market.type.like("prop:%"),
               Market.status.in_(["open", "suspended"]),
               Event.status == "ended"))).all()
    if not rows:
        return {"graded": 0, "voided": 0}

    provider = get_stats_provider()
    now = datetime.now(timezone.utc)
    stats_by_event: dict[int, dict | None] = {}
    graded = voided = 0
    for m, ev in rows:
        if ev.id not in stats_by_event:
            sp = (await session.execute(
                select(Sport.key).join(Competition, Competition.sport_id == Sport.id)
                .where(Competition.id == ev.competition_id))).scalar()
            stats_by_event[ev.id] = await provider.player_stats(sp or "", ev)
        stats = stats_by_event[ev.id]
        sels = (await session.execute(
            select(Selection).where(Selection.market_id == m.id))).scalars().all()

        parsed = parse_market(m)
        actual = None
        if stats is not None and parsed:
            player, stat = parsed
            entry = stats[norm_name(player)] if hasattr(stats, "__missing__") \
                else stats.get(norm_name(player))
            if entry is None:        # fallback: surname + first initial
                np = norm_name(player)
                last = np.split()[-1] if np.split() else np
                first = np[:1]
                for cand, st in list(stats.items()):
                    cs = cand.split()
                    if cs and cs[-1] == last and cand[:1] == first:
                        entry = st
                        break
            if entry:
                actual = entry.get(stat)

        if actual is not None:
            grade_prop_market(m, sels, actual)
            graded += 1
        else:
            ended_at = ev.starts_at if ev.starts_at.tzinfo else ev.starts_at.replace(tzinfo=timezone.utc)
            if now - ended_at > timedelta(hours=GRADE_VOID_HOURS):
                void_prop_market(m, sels)
                voided += 1

    result = {"graded": graded, "voided": voided}
    if graded or voided:
        result["settlement"] = await settle_bets(session)
    await session.flush()
    return result
