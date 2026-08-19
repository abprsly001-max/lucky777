"""The live engine: simulated in-play games.

Until a real live data feed is wired in (that is a paid product everywhere),
this simulates the whole in-play lifecycle so the platform around it is real:
games go live, scores tick, the moneyline reprices off the game state, tickets
are accepted mid-game at the live number, and full time grades and settles
through the exact same settlement code as pregame wagers.

NOTE ON RANDOMNESS: scores here come from `random.Random` seeded per
(event, step), the same policy as the fixture feed's final scores -- it is a
stand-in results feed, deterministic per event, and never touches the fairness
engine that games of chance run on.

Derivative markets (totals, spreads, btts, double chance) SUSPEND at kickoff.
Repricing those honestly in-play means modelling remaining variance per sport;
a stale total with three goals already scored is free money against the book.
The moneyline stays open and reprices every tick. Suspended pregame tickets
already written stand and grade normally at full time.
"""
import json
import random
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from .models import Competition, Event, Market, OddsHistory, Selection, Sport
from .odds import apply_margin
from .settlement import (grade_event, grade_period_selection, period_score,
                         settle_bets)

# per-sport scoring behaviour per tick: (p_score_per_side, points_choices)
SCORING = {
    "soccer":           (0.055, [1]),
    "rugby":            (0.18,  [3, 5, 7]),
    "americanfootball": (0.22,  [3, 7]),
    "basketball":       (1.0,   [4, 5, 6, 7, 8]),
    "baseball":         (0.16,  [1, 1, 2]),
    "icehockey":        (0.12,  [1]),
    "tennis":           (0.0,   []),      # set-based, handled specially
    "mma":              (0.0,   []),      # decided at the end
    "esports":          (0.0,   []),      # map-based, handled specially
    "cricket":          (1.0,   [8, 9, 10, 11, 12, 13, 14]),
}

QUARTERED = {"americanfootball", "basketball"}


def _period(sport_key: str, step: int, total: int) -> str:
    f = step / total
    if step >= total:
        return "FT"
    if sport_key in QUARTERED:
        if abs(f - 0.5) < (0.5 / total):
            return "HT"
        return f"Q{min(4, int(f * 4) + 1)}"
    if sport_key == "icehockey":
        return f"P{min(3, int(f * 3) + 1)}"
    if sport_key in ("soccer", "rugby"):
        if abs(f - 0.5) < (0.5 / total):
            return "HT"
        return "1H" if f < 0.5 else "2H"
    if sport_key == "tennis":
        return f"Set {min(5, int(f * 4) + 1)}"
    if sport_key == "cricket":
        return "Inn 1" if f < 0.5 else "Inn 2"
    if sport_key == "baseball":
        return f"Inn {min(9, int(f * 9) + 1)}"
    if sport_key == "esports":
        return f"Map {min(5, int(f * 5) + 1)}"
    if sport_key == "mma":
        return f"R{min(5, int(f * 5) + 1)}"
    return "LIVE"


def _advance_score(sport_key: str, rng: random.Random,
                   home: int, away: int, step: int, total: int) -> tuple[int, int]:
    if sport_key == "tennis":
        # a set concludes roughly every quarter of the game
        if step % max(2, total // 4) == 0 and step > 0:
            if rng.random() < 0.5:
                home += 1
            else:
                away += 1
        return home, away
    if sport_key == "esports":
        if step % max(2, total // 5) == 0 and step > 0:
            if rng.random() < 0.5:
                home += 1
            else:
                away += 1
        return home, away
    if sport_key == "mma":
        if step >= total - 1 and home == 0 and away == 0:
            if rng.random() < 0.5:
                home = 1
            else:
                away = 1
        return home, away

    p, pts = SCORING.get(sport_key, (0.08, [1]))
    for side in ("home", "away"):
        if rng.random() < p:
            gain = rng.choice(pts)
            if side == "home":
                home += gain
            else:
                away += gain
    return home, away


async def _sport_key(session: AsyncSession, event: Event) -> str:
    row = (await session.execute(
        select(Sport.key).join(Competition, Competition.sport_id == Sport.id)
        .where(Competition.id == event.competition_id))).scalar()
    return row or "soccer"


async def go_live(session: AsyncSession, event_ids: list[int] | None = None,
                  count: int = 3) -> list[Event]:
    """Kick off games: scheduled -> live, 0-0, derivatives suspended."""
    if event_ids:
        q = select(Event).where(Event.id.in_(event_ids), Event.status == "scheduled")
    else:
        q = (select(Event).where(Event.status == "scheduled")
             .order_by(Event.starts_at).limit(count))
    evs = (await session.execute(q)).scalars().all()
    for ev in evs:
        ev.status = "live"
        ev.home_score, ev.away_score = 0, 0
        ev.live_step = 0
        ev.period_scores = "[]"
        key = await _sport_key(session, ev)
        ev.period = _period(key, 0, settings.live_total_steps)
        main_spread = main_total = None
        # suspend everything but the moneyline -- see module docstring
        for m in (await session.execute(
                select(Market).where(Market.event_id == ev.id,
                                     Market.status == "open"))).scalars().all():
            if m.type != "h2h":
                m.status = "suspended"
                if m.type == "spreads":
                    main_spread = m
                elif m.type == "totals":
                    main_total = m
            else:
                # freeze the kickoff price as the live model's baseline
                for s in (await session.execute(
                        select(Selection).where(Selection.market_id == m.id)
                )).scalars().all():
                    s.opening_odds = s.odds_decimal
        await _build_alt_ladders(session, ev, key, main_spread, main_total)
        await _build_period_markets(session, ev, key)
    await session.flush()
    return evs


async def _build_period_markets(session: AsyncSession, ev: Event,
                                sport_key: str) -> None:
    """The scoreboard scopes: 1st-5-innings / 1st-half / 1st-period winner
    and total, priced off the full-game moneyline, graded the moment the
    scope is in the books."""
    defs = PERIOD_DEFS.get(sport_key)
    if not defs:
        return
    p_home = await _h2h_home_prob(session, ev)
    for scope, label, total_line in defs:
        # a shorter sample drags the favourite back toward even
        p_scope = Decimal("0.5") + (p_home - Decimal("0.5")) * Decimal("0.8")
        w = Market(event_id=ev.id, type=f"period:{scope}:h2h",
                   name=f"{label} Winner", status="open")
        t = Market(event_id=ev.id, type=f"period:{scope}:total",
                   name=f"{label} Total", line=str(total_line), status="open")
        session.add_all([w, t])
        await session.flush()
        wp = _price_pair(p_scope)
        tp = _price_pair(Decimal("0.5"))
        session.add_all([
            Selection(market_id=w.id, key="home", name=ev.home,
                      odds_decimal=str(wp[0]), opening_odds=str(wp[0])),
            Selection(market_id=w.id, key="away", name=ev.away,
                      odds_decimal=str(wp[1]), opening_odds=str(wp[1])),
            Selection(market_id=t.id, key="over", name=f"Over {total_line}",
                      odds_decimal=str(tp[0]), opening_odds=str(tp[0])),
            Selection(market_id=t.id, key="under", name=f"Under {total_line}",
                      odds_decimal=str(tp[1]), opening_odds=str(tp[1])),
        ])


async def _process_periods(session: AsyncSession, ev: Event,
                           sport_key: str) -> tuple[int, int]:
    """Reprice open period markets with the scope score; grade the ones
    whose scope is finished. Returns (repriced, graded)."""
    rows = (await session.execute(
        select(Selection, Market)
        .join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id,
               Market.type.like("period:%"),
               Market.status == "open"))).all()
    if not rows:
        return 0, 0
    mw = Decimal(str(MARGIN_WEIGHT.get(sport_key, 0.5)))
    pace = Decimal(str(PACE_PROB.get(sport_key, 0.05)))
    by_market: dict[int, list[Selection]] = {}
    markets: dict[int, Market] = {}
    for sel, m in rows:
        by_market.setdefault(m.id, []).append(sel)
        markets[m.id] = m
    repriced = graded = 0
    for mid, sels in by_market.items():
        m = markets[mid]
        scope = m.type.split(":")[1]
        h, a, complete = period_score(ev, scope)
        if complete:
            for sel in sels:
                sel.result = grade_period_selection(m, sel, h, a)
                sel.status = "settled"
                graded += 1
            m.status = "settled"
            continue
        first = next((s for s in sels if s.key in ("home", "over")), None)
        second = next((s for s in sels if s.key in ("away", "under")), None)
        if first is None or second is None:
            continue
        p_open = 1 / Decimal(first.opening_odds or first.odds_decimal)
        p_open = p_open / (p_open + 1 / Decimal(second.opening_odds
                                                or second.odds_decimal))
        if m.type.endswith(":h2h"):
            shift = max(Decimal("-0.35"), min(Decimal("0.35"),
                        Decimal(h - a) * mw * Decimal("0.4")))
        else:
            line = Decimal(m.line or "1")
            shift = max(Decimal("-0.35"), min(Decimal("0.35"),
                        (Decimal(h + a) - line / 2) * pace))
        priced = _price_pair(p_open + shift)
        for sel, price in zip((first, second), priced):
            new = str(price)
            if new != sel.odds_decimal:
                sel.odds_decimal = new
                repriced += 1
    return repriced, graded


# --------------------------------------------------------- alternate lines ----
# how much one half-point of line is worth in cover probability, per sport
HALF_POINT_PROB = {
    "baseball": 0.040, "basketball": 0.016, "americanfootball": 0.024,
    "icehockey": 0.055, "soccer": 0.085, "rugby": 0.018, "cricket": 0.004,
}
# how much one point of scoreboard pace is worth to the total, per sport
PACE_PROB = {
    "baseball": 0.055, "basketball": 0.010, "americanfootball": 0.028,
    "icehockey": 0.090, "soccer": 0.140, "rugby": 0.020, "cricket": 0.003,
}
ALT_OFFSETS = [Decimal(x) for x in
               ("-2.5", "-2.0", "-1.5", "-1.0", "-0.5", "0",
                "0.5", "1.0", "1.5", "2.0", "2.5")]

# period markets per sport: (scope id, display label, opening period total)
PERIOD_DEFS: dict[str, list[tuple[str, str, Decimal]]] = {
    "baseball": [("f5", "1st 5 Innings", Decimal("4.5"))],
    "basketball": [("h1q", "1st Half", Decimal("112.5"))],
    "americanfootball": [("h1q", "1st Half", Decimal("21.5"))],
    "icehockey": [("p1", "1st Period", Decimal("1.5"))],
    "soccer": [("h1s", "1st Half", Decimal("1.5"))],
}

# a sane opening total per sport, for games the feed never priced
DEFAULT_TOTALS = {
    "baseball": Decimal("8.5"), "basketball": Decimal("224.5"),
    "americanfootball": Decimal("44.5"), "icehockey": Decimal("6.5"),
    "soccer": Decimal("2.5"), "rugby": Decimal("44.5"),
    "tennis": Decimal("21.5"), "mma": Decimal("2.5"),
    "boxing": Decimal("9.5"), "cricket": Decimal("300.5"),
}


def _pair_probs(sels: list[Selection]) -> dict[str, Decimal]:
    """Normalized implied probabilities of a frozen two-way market."""
    inv = {s.key: 1 / Decimal(s.odds_decimal) for s in sels}
    total = sum(inv.values())
    return {k: v / total for k, v in inv.items()}


def _price_pair(p_first: Decimal) -> list[Decimal]:
    p = max(Decimal("0.06"), min(Decimal("0.94"), p_first))
    return apply_margin([p, 1 - p], Decimal("1.06"))


async def _h2h_home_prob(session: AsyncSession, ev: Event) -> Decimal:
    """Home win probability off the frozen moneyline (draw mass ignored)."""
    rows = (await session.execute(
        select(Selection).join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id, Market.type == "h2h"))).scalars().all()
    inv = {s.key: 1 / Decimal(s.odds_decimal) for s in rows
           if s.key in ("home", "away")}
    if len(inv) != 2:
        return Decimal("0.5")
    return inv["home"] / (inv["home"] + inv["away"])


async def _build_alt_ladders(session: AsyncSession, ev: Event, sport_key: str,
                             main_spread: Market | None,
                             main_total: Market | None) -> None:
    """Create the live run-line / alt-total ladders off the frozen closers.

    Games the feed never gave a spread or total still get a full board:
    the ladder is synthesized around a sport-typical line, anchored to the
    moneyline for the spread side."""
    hp = Decimal(str(HALF_POINT_PROB.get(sport_key, 0.03)))
    for main, alt_type in ((main_spread, "alt_spreads"), (main_total, "alt_totals")):
        if main is not None and main.line is not None:
            sels = (await session.execute(
                select(Selection).where(Selection.market_id == main.id))).scalars().all()
            if len(sels) != 2:
                continue
            probs = _pair_probs(sels)
            base_line = Decimal(main.line)
            first_key = "home" if alt_type == "alt_spreads" else "over"
            p_base = probs.get(first_key, Decimal("0.5"))
        elif alt_type == "alt_spreads":
            base_line = Decimal("0")
            p_base = max(Decimal("0.2"), min(Decimal("0.8"),
                         await _h2h_home_prob(session, ev)))
        else:
            base_line = DEFAULT_TOTALS.get(sport_key, Decimal("2.5"))
            p_base = Decimal("0.5")
        for off in ALT_OFFSETS:
            line = base_line + off
            steps = off / Decimal("0.5")
            # a friendlier line for the first side raises its cover chance
            p_open = p_base + steps * hp * (1 if alt_type == "alt_spreads" else -1)
            priced = _price_pair(p_open)
            m = Market(event_id=ev.id, type=alt_type, line=str(line),
                       name=("Run Line" if sport_key == "baseball" else "Spread")
                       if alt_type == "alt_spreads" else "Total", status="open")
            session.add(m)
            await session.flush()
            if alt_type == "alt_spreads":
                names = [(f"{ev.home} {'+' if line >= 0 else ''}{line}", "home"),
                         (f"{ev.away} {'+' if -line >= 0 else ''}{-line}", "away")]
            else:
                names = [(f"Over {line}", "over"), (f"Under {line}", "under")]
            for (name, k), price in zip(names, priced):
                session.add(Selection(market_id=m.id, key=k, name=name,
                                      odds_decimal=str(price),
                                      opening_odds=str(price)))
    await session.flush()


# how much one unit of scoreboard margin is worth, per sport -- a goal decides
# a soccer game; a single basket decides nothing
MARGIN_WEIGHT = {
    "soccer": 1.0, "icehockey": 0.9, "rugby": 0.12, "americanfootball": 0.10,
    "basketball": 0.035, "baseball": 0.30, "tennis": 0.9, "mma": 2.0,
    "esports": 0.9, "cricket": 0.02,
}


def _reprice_h2h(rng: random.Random, sels: list[Selection], sport_key: str,
                 home: int, away: int, frac: float) -> int:
    """Shift the moneyline toward the game state, honestly margined.

    The baseline is the OPENING (kickoff) probability, never the current price:
    repricing from an already-shifted price would compound the shift every tick
    and run a one-goal lead to -5000 by halftime.
    """
    keys = [s.key for s in sels]
    probs = {}
    base = [Decimal(s.opening_odds or s.odds_decimal) for s in sels]
    total_implied = sum(1 / b for b in base)
    for s, b in zip(sels, base):
        probs[s.key] = float((1 / b) / total_implied)

    margin = home - away
    # the further into the game, the more the scoreboard is destiny
    weight = MARGIN_WEIGHT.get(sport_key, 0.5) * (0.15 + 0.60 * frac)
    shift = max(-0.60, min(0.60, margin * weight))

    p_home = probs.get("home", 0.5) + shift
    p_away = probs.get("away", 0.5) - shift
    if "draw" in probs:
        # a tie late in the game makes the draw live
        p_draw = probs["draw"] + (0.25 * frac if margin == 0 else -0.10 * frac)
        p_draw = max(0.02, min(0.60, p_draw))
    else:
        p_draw = 0.0

    floor = 0.02
    p_home, p_away = max(floor, p_home), max(floor, p_away)
    scale = (1 - p_draw) / (p_home + p_away)
    p_home, p_away = p_home * scale, p_away * scale

    # cap the favourite: p * overround must stay below 1 or the "price" drops
    # under 1.00 and the American conversion prints a favourite as a longshot
    vals = {"home": p_home, "away": p_away}
    if p_draw:
        vals["draw"] = p_draw
    cap = 0.88
    top = max(vals, key=lambda k: vals[k])
    if vals[top] > cap:
        excess = vals[top] - cap
        vals[top] = cap
        rest = [k for k in vals if k != top]
        rest_total = sum(vals[k] for k in rest) or 1.0
        for k in rest:
            vals[k] += excess * (vals[k] / rest_total)

    ordered = [vals.get(k, 0.02) for k in keys]
    priced = apply_margin([Decimal(str(round(p, 4))) for p in ordered], Decimal("1.06"))

    moved = 0
    for s, price in zip(sels, priced):
        new = str(price)
        if new != s.odds_decimal:
            s.odds_decimal = new
            moved += 1
    return moved


async def tick(session: AsyncSession, synthetic_only: bool = False) -> dict:
    """Advance every live game one step of the clock. With synthetic_only,
    only the house's own fixtures (esports) tick — the real feed's games
    are driven by real scores instead."""
    total = settings.live_total_steps
    q = select(Event).where(Event.status == "live")
    if synthetic_only:
        q = q.where(Event.provider_id.like("synth:%"))
    evs = (await session.execute(q)).scalars().all()

    ended, repriced, period_graded = [], 0, 0
    for ev in evs:
        key = await _sport_key(session, ev)
        ev.live_step += 1
        rng = random.Random(f"live:{ev.provider_id}:{ev.live_step}")
        prev_h, prev_a = ev.home_score or 0, ev.away_score or 0
        ev.home_score, ev.away_score = _advance_score(
            key, rng, ev.home_score or 0, ev.away_score or 0, ev.live_step, total)
        ev.period = _period(key, ev.live_step, total)
        _tally_period(ev, ev.home_score - prev_h, ev.away_score - prev_a)

        if ev.live_step >= total:
            # full time: draws are impossible where the sport can't end level
            if ev.home_score == ev.away_score and key in ("tennis", "mma", "esports",
                                                          "basketball"):
                if rng.random() < 0.5:
                    ev.home_score += 1
                else:
                    ev.away_score += 1
            await grade_event(session, ev, ev.home_score, ev.away_score)
            ended.append(ev)
            continue

        sels = (await session.execute(
            select(Selection).join(Market, Market.id == Selection.market_id)
            .where(Market.event_id == ev.id, Market.type == "h2h",
                   Market.status == "open", Selection.status == "open")
        )).scalars().all()
        if sels:
            n = _reprice_h2h(rng, sels, key, ev.home_score, ev.away_score,
                             ev.live_step / total)
            for s in sels:
                if n:
                    session.add(OddsHistory(selection_id=s.id, odds_decimal=s.odds_decimal))
            repriced += n
        repriced += await _reprice_alts(session, ev, key, ev.live_step / total)
        pr, pg = await _process_periods(session, ev, key)
        repriced += pr
        period_graded += pg

    result = {"live": len(evs) - len(ended), "ended": len(ended), "repriced": repriced}
    if ended or period_graded:
        result["settlement"] = await settle_bets(session)
    await session.flush()
    return result


def _tally_period(ev: Event, dh: int, da: int) -> None:
    """Fold this tick's scoring into the line score under the current period."""
    try:
        rows = json.loads(ev.period_scores or "[]")
    except ValueError:
        rows = []
    label = ev.period or "LIVE"
    if label == "FT" and rows:
        label = rows[-1]["p"]
    if rows and rows[-1]["p"] == label:
        rows[-1]["h"] += dh
        rows[-1]["a"] += da
    else:
        rows.append({"p": label, "h": dh, "a": da})
    ev.period_scores = json.dumps(rows)


async def _reprice_alts(session: AsyncSession, ev: Event, sport_key: str,
                        frac: float) -> int:
    """Move the alternate ladders with the game, from their opening numbers.

    Spreads follow the scoreboard margin like the moneyline (damped -- a lead
    covers points slowly). Totals follow the scoring pace against the line.
    Once a total is passed the market suspends: the over is decided.
    """
    rows = (await session.execute(
        select(Selection, Market)
        .join(Market, Market.id == Selection.market_id)
        .where(Market.event_id == ev.id,
               Market.type.in_(("alt_spreads", "alt_totals")),
               Market.status == "open"))).all()
    if not rows:
        return 0
    margin = (ev.home_score or 0) - (ev.away_score or 0)
    current_total = (ev.home_score or 0) + (ev.away_score or 0)
    mw = MARGIN_WEIGHT.get(sport_key, 0.5)
    pace = PACE_PROB.get(sport_key, 0.05)
    moved = 0
    by_market: dict[int, list[Selection]] = {}
    markets: dict[int, Market] = {}
    for sel, m in rows:
        by_market.setdefault(m.id, []).append(sel)
        markets[m.id] = m
    for mid, sels in by_market.items():
        m = markets[mid]
        line = Decimal(m.line or "0")
        if m.type == "alt_totals" and Decimal(current_total) > line:
            m.status = "suspended"          # the over is already in
            continue
        first = next((s for s in sels if s.key in ("home", "over")), None)
        second = next((s for s in sels if s.key in ("away", "under")), None)
        if first is None or second is None:
            continue
        p_open = 1 / Decimal(first.opening_odds or first.odds_decimal)
        p_open = p_open / (p_open + 1 / Decimal(second.opening_odds or second.odds_decimal))
        if m.type == "alt_spreads":
            shift = Decimal(str(max(-0.5, min(0.5,
                margin * mw * (0.15 + 0.60 * frac) * 0.8))))
        else:
            expected_so_far = float(line) * frac
            shift = Decimal(str(max(-0.5, min(0.5,
                (current_total - expected_so_far) * pace * (0.2 + 0.8 * frac)))))
        priced = _price_pair(p_open + shift)
        for sel, price in zip((first, second), priced):
            new = str(price)
            if new != sel.odds_decimal:
                sel.odds_decimal = new
                moved += 1
    moved += await _refill_totals(session, ev, sport_key, frac)
    return moved


async def _refill_totals(session: AsyncSession, ev: Event, sport_key: str,
                         frac: float) -> int:
    """Keep the total ladder stocked: as the score climbs past rungs and
    suspends them, new higher rungs open above — the board never runs dry."""
    all_totals = (await session.execute(
        select(Market).where(Market.event_id == ev.id,
                             Market.type == "alt_totals"))).scalars().all()
    if not all_totals:
        return 0
    open_totals = [m for m in all_totals if m.status == "open"]
    if len(open_totals) >= 5:
        return 0
    current_total = (ev.home_score or 0) + (ev.away_score or 0)
    top = max(max(Decimal(m.line or "0") for m in all_totals),
              Decimal(current_total) - Decimal("0.5"))
    pace = Decimal(str(PACE_PROB.get(sport_key, 0.05)))
    expected_final = (Decimal(current_total) / Decimal(str(max(frac, 0.15))))
    added = 0
    while len(open_totals) + added < 5 and added < 6:
        top += Decimal("1")
        p_over = Decimal("0.5") + (expected_final - top) * pace
        priced = _price_pair(p_over)
        m = Market(event_id=ev.id, type="alt_totals", line=str(top),
                   name="Total", status="open")
        session.add(m)
        await session.flush()
        for (name, k), price in zip(
                ((f"Over {top}", "over"), (f"Under {top}", "under")), priced):
            session.add(Selection(market_id=m.id, key=k, name=name,
                                  odds_decimal=str(price),
                                  opening_odds=str(price)))
        added += 1
    return added
