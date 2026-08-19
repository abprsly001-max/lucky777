"""The house esports circuit.

The odds feed carries no esports, so the book runs its own: a rolling
schedule of CS2 / League / Dota / Valorant fixtures that create themselves,
go live on time, play out map by map on the live engine, and settle — no
desk work, ever. Events are tagged `synth:es:` so the real-feed sync never
touches them and the finals sweep never tries to look them up.
"""
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from decimal import Decimal

from .odds import apply_margin

from .models import Competition, Event, Market, Selection, Sport

SYNTH_PREFIX = "synth:es:"

# team pools per title -- original names, tournament flavor
LEAGUES: dict[str, tuple[str, list[str]]] = {
    "esports_cs2": ("CS2 — Blacksite Premier", [
        "Iron Vortex", "Night Raid", "Static Five", "Crimson Peak",
        "Zero Latency", "Anchor Point", "Duskline", "Havoc Unit",
    ]),
    "esports_lol": ("League — Rift Masters", [
        "Baron's Call", "Azure Dragons", "Midlane Kings", "Wolfpack Esports",
        "Nexus Nine", "Elder Gate", "Storm Herald", "First Blood Club",
    ]),
    "esports_dota": ("Dota 2 — Ancient Series", [
        "Radiant Order", "Dire Wolves", "Aegis Bearers", "Rune Traders",
        "Highground Kings", "Smoke Gank", "Roshan's Own", "Creep Wave",
    ]),
    "esports_valorant": ("Valorant — Spike Circuit", [
        "Clutch Factor", "Eco Round", "Site Anchors", "Flash Point",
        "Op Wall", "Retake Crew", "Plant City", "Last Tick",
    ]),
}

MATCHES_AHEAD = 3          # per league, on the board at all times
GAP_MINUTES = (45, 150)    # spacing between a league's fixtures


async def _ensure_sport(session: AsyncSession) -> Sport:
    sp = (await session.execute(
        select(Sport).where(Sport.key == "esports"))).scalar_one_or_none()
    if sp is None:
        sp = Sport(key="esports", name="Esports", icon="🎮")
        session.add(sp)
        await session.flush()
    return sp


async def _ensure_comp(session: AsyncSession, sport_id: int,
                       key: str, name: str) -> Competition:
    comp = (await session.execute(
        select(Competition).where(Competition.key == key))).scalar_one_or_none()
    if comp is None:
        comp = Competition(sport_id=sport_id, key=key, name=name)
        session.add(comp)
        await session.flush()
    return comp


def _price_match(rng: random.Random) -> list[Decimal]:
    """A believable two-way line: one side 35-65%, 6% margin on top."""
    p_home = Decimal(str(round(rng.uniform(0.35, 0.65), 3)))
    return apply_margin([p_home, 1 - p_home], Decimal("1.06"))


async def ensure_schedule(session: AsyncSession) -> int:
    """Keep every league stocked with upcoming fixtures. Returns created."""
    sp = await _ensure_sport(session)
    now = datetime.now(timezone.utc)
    created = 0
    for key, (name, teams) in LEAGUES.items():
        comp = await _ensure_comp(session, sp.id, key, name)
        upcoming = (await session.execute(
            select(func.count()).select_from(Event).where(
                Event.competition_id == comp.id,
                Event.status == "scheduled"))).scalar() or 0
        last_start = (await session.execute(
            select(func.max(Event.starts_at)).where(
                Event.competition_id == comp.id,
                Event.status.in_(["scheduled", "live"])))).scalar()
        anchor = last_start or now
        if anchor.tzinfo is None:
            anchor = anchor.replace(tzinfo=timezone.utc)
        anchor = max(anchor, now)
        rng = random.Random(f"{key}:{now.strftime('%Y%m%d%H')}")
        for _ in range(MATCHES_AHEAD - upcoming):
            a, b = rng.sample(teams, 2)
            anchor = anchor + timedelta(minutes=rng.randint(*GAP_MINUTES))
            ev = Event(provider_id=f"{SYNTH_PREFIX}{key}:{anchor.timestamp():.0f}",
                       competition_id=comp.id, home=a, away=b,
                       starts_at=anchor)
            session.add(ev)
            await session.flush()
            m = Market(event_id=ev.id, type="h2h", name="Match Winner")
            t = Market(event_id=ev.id, type="totals", name="Total Maps",
                       line="2.5")
            session.add_all([m, t])
            await session.flush()
            hp, ap = _price_match(rng)
            tp = apply_margin([Decimal("0.5"), Decimal("0.5")], Decimal("1.06"))
            session.add_all([
                Selection(market_id=m.id, key="home", name=a,
                          odds_decimal=str(hp)),
                Selection(market_id=m.id, key="away", name=b,
                          odds_decimal=str(ap)),
                Selection(market_id=t.id, key="over", name="Over 2.5 maps",
                          odds_decimal=str(tp[0])),
                Selection(market_id=t.id, key="under", name="Under 2.5 maps",
                          odds_decimal=str(tp[1])),
            ])
            created += 1
    await session.flush()
    return created


async def kickoff_due(session: AsyncSession) -> int:
    """Send synthetic matches live the moment their start time passes."""
    from . import live
    now = datetime.now(timezone.utc)
    due = (await session.execute(
        select(Event).where(Event.status == "scheduled",
                            Event.provider_id.like(f"{SYNTH_PREFIX}%"),
                            Event.starts_at <= now))).scalars().all()
    if due:
        await live.go_live(session, [e.id for e in due])
    return len(due)
