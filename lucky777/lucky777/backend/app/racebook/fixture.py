"""The race card generator and results feed, offline like the sports fixture.

NOTE ON RANDOMNESS: `random.Random` seeded per race, the same policy as the
sports fixture -- deterministic demo cards and a stable stand-in results feed.
Finish orders are sampled from the morning-line probabilities, so favourites
win more often, longshots sometimes hit, and the book behaves like a book.
"""
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .engine import ml_decimal
from .models import Race, Runner, Track

TRACKS = [
    ("fingerlakes", "Finger Lakes"),
    ("churchill", "Churchill Downs"),
    ("santaanita", "Santa Anita"),
    ("gulfstream", "Gulfstream Park"),
]

ML_LADDER = ["1/2", "3/5", "4/5", "1/1", "6/5", "3/2", "8/5", "9/5", "2/1",
             "5/2", "3/1", "7/2", "4/1", "9/2", "5/1", "6/1", "8/1", "10/1",
             "12/1", "15/1", "20/1", "30/1"]

NAME_A = ["Night", "Swift", "Burning", "Deputy", "King", "Lucky", "Iron", "Golden",
          "Midnight", "Thunder", "Silver", "Wild", "Royal", "Smart", "Dixie", "Cajun",
          "Bold", "Frost", "Copper", "Velvet"]
NAME_B = ["Mission", "Bank", "Munny", "Tramon", "Khali", "Seven", "Duke", "Arrow",
          "Express", "Storm", "Legacy", "Runner", "Empire", "Whiskey", "Star",
          "Bullet", "Charm", "Patrol", "Canyon", "Blaze"]
JOCKEYS = ["J M Rohena", "J C Berrios", "N Alvarado", "O Gomez", "S Fret",
           "A S Worrie", "L Vega", "T Marlow", "D Cruz", "K Ortiz", "M Chen",
           "R Baker", "P Silva", "E Knox"]

RACES_PER_DAY = 8
FIRST_POST_UTC = 17          # 17:00 UTC ~ 12/1pm US afternoons
MINUTES_BETWEEN = 35


def _seed(track_key: str, day: str, number: int) -> str:
    return f"rb:{track_key}:{day}:{number}"


def _runners(rng: random.Random) -> list[dict]:
    n = rng.randint(6, 9)
    names = rng.sample([f"{a} {b}" for a in NAME_A for b in NAME_B], n)
    out = []
    for i in range(n):
        out.append({
            "pn": i + 1,
            "name": names[i][:20],
            "jockey": rng.choice(JOCKEYS),
            "ml": rng.choice(ML_LADDER),
            "weight": f"L{rng.choice([118, 120, 122, 124, 126])}",
        })
    # every race gets one genuine favourite so the card reads right
    fav = rng.randrange(n)
    out[fav]["ml"] = rng.choice(["6/5", "3/2", "8/5", "2/1", "5/2"])
    return out


async def ensure_card(session: AsyncSession, days_ahead: int = 1) -> int:
    """Make sure every track has races today (and tomorrow). Idempotent."""
    created = 0
    now = datetime.now(timezone.utc)
    for key, name in TRACKS:
        track = (await session.execute(
            select(Track).where(Track.key == key))).scalar_one_or_none()
        if track is None:
            track = Track(key=key, name=name)
            session.add(track)
            await session.flush()
        for d in range(days_ahead + 1):
            day = (now + timedelta(days=d)).date()
            first = datetime(day.year, day.month, day.day, FIRST_POST_UTC,
                             tzinfo=timezone.utc)
            exists = (await session.execute(
                select(Race.id).where(Race.track_id == track.id,
                                      Race.post_time >= first,
                                      Race.post_time < first + timedelta(days=1))
                .limit(1))).scalar()
            if exists:
                continue
            for i in range(RACES_PER_DAY):
                rng = random.Random(_seed(key, day.isoformat(), i + 1))
                race = Race(track_id=track.id, number=i + 1,
                            post_time=first + timedelta(minutes=MINUTES_BETWEEN * i))
                session.add(race)
                await session.flush()
                for r in _runners(rng):
                    session.add(Runner(race_id=race.id, **r))
                created += 1
    await session.flush()
    return created


def simulate_finish(rng: random.Random, runners: list[Runner]) -> list[int]:
    """Finish order sampled from ML-implied probabilities, no replacement."""
    field = [(r.pn, float(1 / ml_decimal(r.ml))) for r in runners]
    order: list[int] = []
    while field:
        total = sum(w for _, w in field)
        pick = rng.uniform(0, total)
        acc = 0.0
        for i, (pn, w) in enumerate(field):
            acc += w
            if pick <= acc:
                order.append(pn)
                field.pop(i)
                break
        else:
            order.append(field.pop()[0])
    return order
