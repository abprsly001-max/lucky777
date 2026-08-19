"""Extra pregame markets synthesized off the mains.

No cheap feed carries these, but every one of them grades EXACTLY off the
final score, so the house can hang them on every game and the settlement
worker pays them with zero human input:

  * odd_even        -- game total odd or even, two-way
  * winning_margin  -- margin-of-victory bands per side (draw where the
                       sport can end level), multi-way
  * correct_score   -- soccer only: the classic 0-0..3-3 grid + Any Other

They price off the same anchors as everything else (the moneyline lean and
the game total), carry a proper multi-way margin, and SUSPEND at kickoff
like every derivative -- pregame tickets stand and grade at full time.
"""
import math
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Competition, Event, Market, Selection, Sport
from .odds import apply_margin

# margin-of-victory bands per sport: (lo, hi) with hi=None meaning "or more"
MARGIN_BANDS: dict[str, list[tuple[int, int | None]]] = {
    "soccer": [(1, 1), (2, 2), (3, None)],
    "icehockey": [(1, 1), (2, 2), (3, None)],
    "baseball": [(1, 1), (2, 3), (4, None)],
    "basketball": [(1, 5), (6, 12), (13, None)],
    "americanfootball": [(1, 6), (7, 13), (14, None)],
    "rugby": [(1, 6), (7, 13), (14, None)],
}
# how a side's win probability spreads across its bands, tightest band first
BAND_WEIGHTS: dict[str, list[Decimal]] = {
    "soccer": [Decimal("0.52"), Decimal("0.29"), Decimal("0.19")],
    "icehockey": [Decimal("0.50"), Decimal("0.30"), Decimal("0.20")],
    "baseball": [Decimal("0.38"), Decimal("0.37"), Decimal("0.25")],
    "basketball": [Decimal("0.32"), Decimal("0.36"), Decimal("0.32")],
    "americanfootball": [Decimal("0.36"), Decimal("0.36"), Decimal("0.28")],
    "rugby": [Decimal("0.36"), Decimal("0.36"), Decimal("0.28")],
}
DRAW_SPORTS = {"soccer"}
EXTRA_SPORTS = set(MARGIN_BANDS)

CS_GRID_MAX = 3      # correct score lists 0-0 .. 3-3; past that "Any Other" wins


def band_key(side: str, lo: int, hi: int | None) -> str:
    return f"{side}:{lo}-{hi}" if hi is not None else f"{side}:{lo}+"


def band_label(team: str, lo: int, hi: int | None) -> str:
    if hi is None:
        return f"{team} by {lo}+"
    if lo == hi:
        return f"{team} by {lo}"
    return f"{team} by {lo}-{hi}"


def margin_band_hit(key: str, margin: int) -> bool:
    """Does a final margin land inside a band key like 'home:2-3' / 'away:4+'?"""
    side, _, band = key.partition(":")
    if margin == 0 or (margin > 0) != (side == "home"):
        return False
    m = abs(margin)
    if band.endswith("+"):
        return m >= int(band[:-1])
    lo, hi = band.split("-")
    return int(lo) <= m <= int(hi)


def _poisson(lam: float, k: int) -> Decimal:
    return Decimal(str(math.exp(-lam) * lam ** k / math.factorial(k)))


async def _sport_key_of(session: AsyncSession, ev: Event) -> str:
    row = (await session.execute(
        select(Sport.key).join(Competition, Competition.sport_id == Sport.id)
        .where(Competition.id == ev.competition_id))).scalar()
    return (row or "soccer").split("_")[0]


async def _anchors(session: AsyncSession, ev: Event) -> tuple[Decimal, Decimal | None]:
    """(home win probability, game total line) off the event's own mains."""
    rows = (await session.execute(
        select(Selection, Market.type, Market.line)
        .join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id,
               Market.type.in_(("h2h", "totals"))))).all()
    inv: dict[str, Decimal] = {}
    total_line: Decimal | None = None
    for sel, mtype, mline in rows:
        if mtype == "h2h" and sel.key in ("home", "away"):
            inv[sel.key] = 1 / Decimal(sel.odds_decimal)
        elif mtype == "totals" and mline is not None and total_line is None:
            total_line = Decimal(mline)
    if len(inv) == 2:
        p_home = inv["home"] / (inv["home"] + inv["away"])
    else:
        p_home = Decimal("0.5")
    return p_home, total_line


async def build_extras(session: AsyncSession, ev: Event,
                       sport_key: str | None = None) -> int:
    """Hang the extra markets on one event. Idempotent by market uniqueness
    (the caller checks for an existing odd_even before calling). Returns
    how many markets were created."""
    key = sport_key or await _sport_key_of(session, ev)
    if key not in EXTRA_SPORTS:
        return 0
    p_home, total_line = await _anchors(session, ev)
    made = 0

    # ---- odd / even ------------------------------------------------------
    m = Market(event_id=ev.id, type="odd_even", name="Total Odd/Even", status="open")
    session.add(m)
    await session.flush()
    oe = apply_margin([Decimal("0.5"), Decimal("0.5")], Decimal("1.06"))
    session.add_all([
        Selection(market_id=m.id, key="odd", name="Odd", odds_decimal=str(oe[0])),
        Selection(market_id=m.id, key="even", name="Even", odds_decimal=str(oe[1])),
    ])
    made += 1

    # ---- winning margin --------------------------------------------------
    bands = MARGIN_BANDS[key]
    weights = BAND_WEIGHTS[key]
    p_draw = Decimal("0.24") if key in DRAW_SPORTS else Decimal(0)
    p_h = p_home * (1 - p_draw)
    p_a = (1 - p_home) * (1 - p_draw)
    probs: list[Decimal] = []
    entries: list[tuple[str, str]] = []
    for side, team, p_side in (("home", ev.home, p_h), ("away", ev.away, p_a)):
        for (lo, hi), w in zip(bands, weights):
            entries.append((band_key(side, lo, hi), band_label(team, lo, hi)))
            probs.append(p_side * w)
    if p_draw:
        entries.append(("draw", "Draw"))
        probs.append(p_draw)
    priced = apply_margin(probs, Decimal("1.10"))
    m = Market(event_id=ev.id, type="winning_margin", name="Winning Margin",
               status="open")
    session.add(m)
    await session.flush()
    for (k, label), price in zip(entries, priced):
        session.add(Selection(market_id=m.id, key=k, name=label,
                              odds_decimal=str(price)))
    made += 1

    # ---- correct score (soccer) -----------------------------------------
    if key in DRAW_SPORTS:
        lam_total = float(total_line if total_line is not None else Decimal("2.5"))
        # split the goal expectation by the moneyline lean, gently
        share = 0.5 + (float(p_home) - 0.5) * 0.55
        lam_h, lam_a = lam_total * share, lam_total * (1 - share)
        cs_probs: list[Decimal] = []
        cs_entries: list[tuple[str, str]] = []
        covered = Decimal(0)
        for h in range(CS_GRID_MAX + 1):
            for a in range(CS_GRID_MAX + 1):
                p = _poisson(lam_h, h) * _poisson(lam_a, a)
                covered += p
                cs_entries.append((f"{h}-{a}", f"{h}-{a}"))
                cs_probs.append(p)
        cs_entries.append(("other", "Any Other"))
        cs_probs.append(max(Decimal("0.01"), 1 - covered))
        priced = apply_margin(cs_probs, Decimal("1.18"))
        m = Market(event_id=ev.id, type="correct_score", name="Correct Score",
                   status="open")
        session.add(m)
        await session.flush()
        for (k, label), price in zip(cs_entries, priced):
            session.add(Selection(market_id=m.id, key=k, name=label,
                                  odds_decimal=str(price)))
        made += 1

    await session.flush()
    return made


async def backfill_extras(session: AsyncSession, limit: int = 800) -> int:
    """Every scheduled game that never got the extra markets gets them now.
    Runs inside the normal board sync, so the whole book fills in one pass."""
    have = select(Market.event_id).where(Market.type == "odd_even")
    evs = (await session.execute(
        select(Event).where(Event.status == "scheduled",
                            ~Event.provider_id.like("outright:%"),
                            Event.id.not_in(have)).limit(limit))).scalars().all()
    made = 0
    for ev in evs:
        made += await build_extras(session, ev)

    # pregame team totals for games from before that market existed
    from .live import TEAM_TOTAL_SPORTS, _build_team_totals
    have_tt = select(Market.event_id).where(Market.type == "team_total_home")
    evs_tt = (await session.execute(
        select(Event).where(Event.status == "scheduled",
                            ~Event.provider_id.like("outright:%"),
                            Event.id.not_in(have_tt)).limit(limit))).scalars().all()
    for ev in evs_tt:
        key = await _sport_key_of(session, ev)
        if key not in TEAM_TOTAL_SPORTS:
            continue
        main_total = (await session.execute(
            select(Market).where(Market.event_id == ev.id,
                                 Market.type == "totals"))).scalars().first()
        await _build_team_totals(session, ev, key, main_total)
        made += 1
    await session.flush()
    return made
