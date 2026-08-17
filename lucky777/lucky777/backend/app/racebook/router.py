"""The racebook: cards, tickets, and the self-grading off.

Money flows through the same ledger as everything else (kind bet_place /
bet_settle, ref_type "race_bet"), so race action lands in the weekly figures
and the player's statement with zero special cases.
"""
import random
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..core import ledger
from ..core.money import from_micros, to_micros
from ..core.security import betting_user, current_user
from ..db import get_session
from ..models import User
from . import engine, fixture
from .models import Race, RaceBet, Runner, Track

router = APIRouter(prefix="/api/racebook", tags=["racebook"])


async def tick(session: AsyncSession) -> dict:
    """Run races whose post time has passed, then settle their tickets.
    Called by the background clock alongside the live sports engine."""
    now = datetime.now(timezone.utc)
    due = (await session.execute(
        select(Race).where(Race.status == "scheduled",
                           Race.post_time <= now))).scalars().all()
    finished = 0
    for race in due:
        runners = (await session.execute(
            select(Runner).where(Runner.race_id == race.id))).scalars().all()
        track = await session.get(Track, race.track_id)
        rng = random.Random(f"result:{fixture._seed(track.key, race.post_time.date().isoformat(), race.number)}")
        order = fixture.simulate_finish(rng, runners)
        race.result = "-".join(str(pn) for pn in order)
        race.status = "final"
        finished += 1

    settled = 0
    if finished:
        house = await ledger.house_account(session)
        open_bets = (await session.execute(
            select(RaceBet, Race).join(Race, Race.id == RaceBet.race_id)
            .where(RaceBet.status == "open", Race.status == "final"))).all()
        for bet, race in open_bets:
            finish = [int(x) for x in (race.result or "").split("-") if x]
            picks = [int(x) for x in bet.picks.split("-")]
            won = engine.grade(bet.kind, picks, finish)
            bet.status = "won" if won else "lost"
            bet.payout_micros = bet.potential_micros if won else 0
            bet.settled_at = datetime.now(timezone.utc)
            if won:
                wallet = await ledger.wallet_for(session, bet.user_id)
                await ledger.transfer(
                    session, idempotency_key=f"rb:{bet.id}:settle", kind="bet_settle",
                    src=house.id, dst=wallet.id, amount_micros=bet.payout_micros,
                    ref_type="race_bet", ref_id=bet.id)
            settled += 1
    await session.flush()
    return {"races_off": finished, "settled": settled}


@router.get("/card")
async def card(session: AsyncSession = Depends(get_session)):
    """Every track's remaining races today (and tomorrow), runners included."""
    await fixture.ensure_card(session)
    # self-healing: races past post run and settle right here, so the card is
    # always current even if the background clock is off
    await tick(session)
    now = datetime.now(timezone.utc)
    tracks = (await session.execute(select(Track).order_by(Track.name))).scalars().all()
    out = []
    for t in tracks:
        races = (await session.execute(
            select(Race).where(Race.track_id == t.id)
            .order_by(Race.post_time))).scalars().all()
        r_out = []
        for r in races:
            post = r.post_time if r.post_time.tzinfo else r.post_time.replace(tzinfo=timezone.utc)
            # show what's coming plus the last few results, skip ancient history
            if post < now and r.status == "final" and (now - post).days >= 1:
                continue
            runners = (await session.execute(
                select(Runner).where(Runner.race_id == r.id).order_by(Runner.pn)
            )).scalars().all()
            r_out.append({
                "id": r.id, "number": r.number, "post_time": post.isoformat(),
                "status": r.status, "result": r.result,
                "runners": [{
                    "pn": x.pn, "name": x.name, "jockey": x.jockey,
                    "ml": x.ml, "weight": x.weight,
                } for x in runners],
            })
        out.append({"key": t.key, "name": t.name, "races": r_out})
    await session.commit()
    return {
        "tracks": out,
        "limits": {
            "min": settings.racebook_min_credits,
            "max": settings.racebook_max_credits,
            "max_payout_per_race": settings.racebook_max_payout_credits,
        },
        "note": "Win pays the morning line; Place a quarter of it, Show an eighth. "
                "Exactas pay A×B÷2, trifectas A×B×C÷4. Every ticket is capped by "
                "the max payout per race.",
    }


class RaceBetRequest(BaseModel):
    race_id: int
    kind: str
    picks: list[int] = Field(..., min_length=1, max_length=3)
    stake: str
    idempotency_key: str | None = None


@router.post("/bets")
async def place_race_bet(req: RaceBetRequest, user: User = Depends(betting_user),
                         session: AsyncSession = Depends(get_session)):
    if not user.allow_sportsbook and not user.is_admin:
        raise HTTPException(403, "wagering is switched off for your account - ask your agent")
    need = engine.PICKS_REQUIRED.get(req.kind)
    if need is None:
        raise HTTPException(400, "unknown bet type")
    if len(req.picks) != need or len(set(req.picks)) != need:
        raise HTTPException(400, f"{req.kind} takes {need} different runner(s)")
    try:
        stake = Decimal(req.stake)
    except InvalidOperation:
        raise HTTPException(400, "stake is not a number")
    if stake < Decimal(settings.racebook_min_credits):
        raise HTTPException(400, f"minimum race wager is {settings.racebook_min_credits}")
    if stake > Decimal(settings.racebook_max_credits):
        raise HTTPException(400, f"maximum race wager is {settings.racebook_max_credits}")

    race = await session.get(Race, req.race_id)
    if race is None:
        raise HTTPException(404, "no such race")
    post = race.post_time if race.post_time.tzinfo else race.post_time.replace(tzinfo=timezone.utc)
    if race.status != "scheduled" or post <= datetime.now(timezone.utc):
        raise HTTPException(409, "that race is off — wagering is closed")

    runners = {r.pn: r for r in (await session.execute(
        select(Runner).where(Runner.race_id == race.id))).scalars().all()}
    if any(pn not in runners for pn in req.picks):
        raise HTTPException(400, "unknown program number for this race")

    stake_m = to_micros(stake)
    mls = [runners[pn].ml for pn in req.picks]
    pot = engine.potential(req.kind, mls, stake_m,
                           to_micros(Decimal(settings.racebook_max_payout_credits)))

    bet = RaceBet(user_id=user.id, race_id=race.id, kind=req.kind,
                  picks="-".join(str(p) for p in req.picks),
                  stake_micros=stake_m, potential_micros=pot)
    session.add(bet)
    await session.flush()

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    key = req.idempotency_key or secrets.token_hex(8)
    try:
        await ledger.transfer(
            session, idempotency_key=f"rb:{bet.id}:place:{key}", kind="bet_place",
            src=wallet.id, dst=house.id, amount_micros=stake_m,
            ref_type="race_bet", ref_id=bet.id,
            src_floor_micros=-(user.credit_limit_micros or 0))
    except ledger.InsufficientFunds:
        await session.rollback()
        raise HTTPException(402, "insufficient balance")

    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"bet_id": bet.id, "kind": bet.kind, "picks": bet.picks,
            "stake": str(from_micros(stake_m)),
            "potential": str(from_micros(pot)),
            "balance": str(from_micros(balance))}


@router.get("/bets")
async def my_race_bets(limit: int = 40, user: User = Depends(current_user),
                       session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(RaceBet, Race, Track)
        .join(Race, Race.id == RaceBet.race_id)
        .join(Track, Track.id == Race.track_id)
        .where(RaceBet.user_id == user.id)
        .order_by(RaceBet.id.desc()).limit(min(limit, 200)))).all()
    runners_by_race: dict[int, dict[int, str]] = {}
    out = []
    for bet, race, track in rows:
        if race.id not in runners_by_race:
            rs = (await session.execute(
                select(Runner).where(Runner.race_id == race.id))).scalars().all()
            runners_by_race[race.id] = {r.pn: r.name for r in rs}
        names = runners_by_race[race.id]
        out.append({
            "bet_id": bet.id, "kind": bet.kind, "status": bet.status,
            "track": track.name, "race": race.number,
            "picks": [{"pn": int(p), "name": names.get(int(p), "?")}
                      for p in bet.picks.split("-")],
            "stake": str(from_micros(bet.stake_micros)),
            "potential": str(from_micros(bet.potential_micros)),
            "payout": (str(from_micros(bet.payout_micros))
                       if bet.payout_micros is not None else None),
            "result": race.result, "placed_at": bet.placed_at.isoformat(),
        })
    await session.commit()
    return out
