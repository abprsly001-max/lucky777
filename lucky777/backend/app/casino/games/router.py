"""Dice, Wheel, and Blackjack -- same ledger, same fairness, same gates as Duel.

Product attribution rides ref_type (dice_roll / wheel_spin / blackjack_hand),
so casino action lands in the figures exactly like everything else.
"""
import json
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...core import ledger, seeds
from ...core.money import from_micros, payout_micros, to_micros
from ...core.security import betting_user, current_user
from ...db import get_session
from ...models import CasinoRound, User
from . import engines as E

router = APIRouter(prefix="/api/casino", tags=["casino"])


def _stake_or_400(raw: str, user: User) -> int:
    try:
        stake = Decimal(raw)
    except InvalidOperation:
        raise HTTPException(400, "stake is not a number")
    if stake < Decimal(settings.min_bet_credits):
        raise HTTPException(400, f"minimum stake is {settings.min_bet_credits}")
    cap = (from_micros(user.wager_limit_micros) if user.wager_limit_micros
           else Decimal(settings.max_bet_credits))
    if stake > cap:
        raise HTTPException(400, f"your limit on a single wager is {cap}")
    return to_micros(stake)


def _casino_gate(user: User):
    if not user.allow_casino and not user.is_admin:
        raise HTTPException(403, "casino is switched off for your account - ask your agent")


async def _charge(session, user, amount, ref_type, ref_id, key):
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    try:
        await ledger.transfer(
            session, idempotency_key=key, kind="bet_place",
            src=wallet.id, dst=house.id, amount_micros=amount,
            ref_type=ref_type, ref_id=ref_id,
            src_floor_micros=-(user.credit_limit_micros or 0))
    except ledger.InsufficientFunds:
        await session.rollback()
        raise HTTPException(402, "insufficient balance")
    return wallet, house


async def _pay(session, house, wallet, amount, ref_type, ref_id, key):
    if amount > 0:
        await ledger.transfer(
            session, idempotency_key=key, kind="bet_settle",
            src=house.id, dst=wallet.id, amount_micros=amount,
            ref_type=ref_type, ref_id=ref_id)


def _holdspin_entry(mn: str, mx: str) -> list[dict]:
    from . import holdspin as HS
    grand = (HS.GRAND_MULT * HS._scale).quantize(Decimal("0.1"))
    return [{
        "key": "holdspin", "name": "Piggy Bank Blast", "icon": "🐷",
        "category": "slots", "min": mn, "max": mx,
        "rules": f"Coins pay their face the moment they land. Six or more "
                 f"locks them in and starts 3 respins — every new coin resets "
                 f"the count. Fill all 15 for the {grand}x Grand.",
        "holdspin": {
            "trigger": HS.TRIGGER, "respins": HS.RESPINS,
            "grand": str(grand),
            "faces": [str(v) for v, _ in HS.scaled_coin_values()],
        },
    }]


def _dragon_entry(mn: str, mx: str) -> list[dict]:
    from . import dragon as DR
    return [{
        "key": "dragon", "name": "Golden Dragon Inferno", "icon": "🐉",
        "category": "slots", "min": mn, "max": mx,
        "rules": "Fortune coins pay the moment they land — some carry a "
                 "jackpot from the ladder. Six or more locks them in and "
                 "starts 3 respins; every new coin resets the count. Fill "
                 "all 15 for the GRAND on top.",
        "dragon": {
            "trigger": DR.TRIGGER, "respins": DR.RESPINS,
            "jackpots": {t: str(v) for t, v in DR.JACKPOTS.items()},
            "grand": str(DR.GRAND_MULT),
            "faces": [str(v) for v, _ in DR.scaled_coin_values()],
            "buy_cost": str(DR.buy_cost_mult()),
        },
    }]


def _tumble_entry(mn: str, mx: str) -> list[dict]:
    from . import tumble as T
    return [{
        "key": "tumble", "name": "Sugar Blast", "icon": "🍭",
        "category": "slots", "min": mn, "max": mx,
        "rules": "No paylines — 8 or more of a symbol anywhere pays. Wins "
                 "explode and fresh symbols tumble in while the chain lasts. "
                 "4+ lollipops award 10 free spins where multiplier bombs "
                 "stick and SUM to multiply the spin's win.",
        "tumble": {
            "cols": T.COLS, "rows": T.ROWS, "min_match": T.MIN_MATCH,
            "free_spins": T.FREE_SPINS,
            "symbols": [s for s, _, _ in T.SYMBOLS],
            "pays": {s: [str((Decimal(t) * T._SCALE).quantize(Decimal('0.01')))
                         for t in tiers] for s, _, tiers in T.SYMBOLS},
            "scatter_pays": {str(k): str((v * T._SCALE).quantize(Decimal('0.01')))
                             for k, v in T.SCATTER_PAYS.items()},
            "bombs": [v for v, _ in T.BOMB_VALUES],
            "buy_cost": str(T.BUY_COST_MULT),
            "max_win": str(T.MAX_WIN_MULT),
        },
    }]


def _vslot_entries(mn: str, mx: str) -> list[dict]:
    from . import videoslots as VS
    out = []
    for key, m in VS.VIDEO_SLOTS.items():
        fs = m["free_spins"]
        out.append({
            "key": f"vslot:{key}", "name": m["name"], "icon": "🎰",
            "category": "slots", "min": mn, "max": mx,
            "rules": m["tagline"] + f" 5 reels, 20 lines. {fs['trigger']}+ scatters "
                     f"award {fs['count']} free spins at {fs['mult']}x.",
            "vslot": {
                "machine": key,
                "symbols": [k for k, _, _ in m["symbols"]],
                "pays": {k: {str(n): str(v) for n, v in p.items()}
                         for k, _, p in m["symbols"] if p},
                "free_spins": fs,
                "lines": len(VS.LINES),
                "buy_cost": VS.buy_cost_mult(m),
            },
        })
    return out


def _slot_entries(mn: str, mx: str) -> list[dict]:
    out = []
    for key, m in E.SLOT_MACHINES.items():
        rtp = E.slot_exact_rtp(m)
        out.append({
            "key": f"slot:{key}", "name": m["name"], "icon": "🎰",
            "category": "slots", "min": mn, "max": mx,
            "rules": m["tagline"] + " The paytable is printed on the machine.",
            "slot": {
                "machine": key,
                "symbols": m["symbols"],
                "weights": m["weights"],
                "triples": {s: str(v) for s, v in m["triples"].items()},
                "partial": ({"symbol": m["partial"]["symbol"],
                             "two": str(m["partial"]["two"]),
                             "one": str(m["partial"]["one"])}
                            if m.get("partial") else None),
            },
        })
    return out


@router.get("/lobby")
async def lobby():
    """Every game, its limits, and its real edge -- nothing decorative."""
    mx = settings.max_bet_credits
    return {
        "games": _tumble_entry(settings.min_bet_credits, mx)
                 + _dragon_entry(settings.min_bet_credits, mx)
                 + _holdspin_entry(settings.min_bet_credits, mx)
                 + _vslot_entries(settings.min_bet_credits, mx)
                 + _slot_entries(settings.min_bet_credits, mx) + [
            {"key": "roulette", "name": "Roulette", "icon": "🎯", "category": "table",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "European single-zero wheel. Straight up pays 35:1, "
                      "dozens and columns 2:1, the even-money bets 1:1."},
            {"key": "videopoker", "name": "Video Poker", "icon": "🂡", "category": "table",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "Jacks or Better. Five cards, hold what you like, "
                      "draw once. Royal pays 800x."},
            {"key": "baccarat", "name": "Baccarat", "icon": "🀄", "category": "table",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "Punto banco from an 8-deck shoe, standard third-card "
                      "tableau. Banker win pays 0.95:1, player 1:1, tie 8:1. "
                      "Player/banker bets push on a tie."},
            {"key": "plinko", "name": "Plinko", "icon": "🔻", "category": "quick",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "Drop the ball through the pegs. Pick your rows and risk "
                      "level — the rim buckets pay big, the middle eats the stake.",
             "plinko": {"rows": list(E.PLINKO_ROWS),
                        "tables": {str(r): {k: [str(m) for m in t]
                                            for k, t in risks.items()}
                                   for r, risks in E.PLINKO_TABLES.items()}}},
            {"key": "mines", "name": "Mines", "icon": "💣", "category": "quick",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "25 tiles, you choose how many mines. Every safe pick "
                      "raises the cash-out multiplier. Hit a mine and the "
                      "stake is gone."},
            {"key": "crash", "name": "Crash", "icon": "🚀", "category": "quick",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "The multiplier climbs until it busts. Cash out first "
                      "and you're paid the number on the screen."},
            {"key": "blackjack", "name": "Blackjack", "icon": "🃏", "category": "table",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "Single deck each hand, dealer stands all 17s, blackjack pays "
                      "3:2, double any first two cards, no splits."},
            {"key": "duel", "name": "Duel", "icon": "⚔️", "category": "table",
             "min": settings.min_bet_credits, "max": mx,
             "rules": f"A straight duel against the house — a win pays "
                      f"{settings.duel_payout_multiplier}x."},
            {"key": "dice", "name": "Dice", "icon": "🎲", "category": "quick",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "Pick your number from 2 to 95 and roll under it to win — "
                      "the longer the shot, the bigger the payout."},
            {"key": "wheel", "name": "Wheel", "icon": "🎡", "category": "quick",
             "min": settings.min_bet_credits, "max": mx,
             "rules": "Three risk levels. "
                      + " · ".join(
                          f"{k} pays up to {max(m for _, m in v)}x"
                          for k, v in E.WHEEL.items())},
        ],
    }


# ------------------------------------------------------------------- dice ----
class DiceRequest(BaseModel):
    stake: str
    chance: str           # win probability in percent, "2".."95"
    idempotency_key: str | None = None


@router.post("/dice/bet")
async def dice_bet(req: DiceRequest, user: User = Depends(betting_user),
                   session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    stake_m = _stake_or_400(req.stake, user)
    try:
        chance = Decimal(req.chance)
    except InvalidOperation:
        raise HTTPException(400, "chance is not a number")
    if not (E.DICE_MIN_CHANCE <= chance <= E.DICE_MAX_CHANCE):
        raise HTTPException(400, f"chance must be {E.DICE_MIN_CHANCE}-{E.DICE_MAX_CHANCE}%")

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    out = E.dice_play(pair.server_seed, pair.client_seed, nonce, chance)
    payout = payout_micros(stake_m, out.multiplier) if out.win else 0

    rnd = CasinoRound(game="dice", user_id=user.id, seed_pair_id=pair.id, nonce=nonce,
                      stake_micros=stake_m, payout_micros=payout,
                      outcome="win" if out.win else "lose",
                      detail=json.dumps({"chance": str(chance), "roll": str(out.roll),
                                         "multiplier": str(out.multiplier)}))
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "dice_roll", rnd.id,
                                  f"dice:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, payout, "dice_roll", rnd.id,
               f"dice:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "nonce": nonce, "roll": str(out.roll),
            "chance": str(chance), "win": out.win,
            "multiplier": str(out.multiplier),
            "payout": str(from_micros(payout)),
            "balance": str(from_micros(balance))}


# ------------------------------------------------------------------ wheel ----
class WheelRequest(BaseModel):
    stake: str
    risk: str             # low | medium | high
    idempotency_key: str | None = None


@router.post("/wheel/bet")
async def wheel_bet(req: WheelRequest, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    stake_m = _stake_or_400(req.stake, user)
    if req.risk not in E.WHEEL:
        raise HTTPException(400, "risk must be low, medium or high")

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    out = E.wheel_play(pair.server_seed, pair.client_seed, nonce, req.risk)
    payout = payout_micros(stake_m, out.multiplier)

    rnd = CasinoRound(game="wheel", user_id=user.id, seed_pair_id=pair.id, nonce=nonce,
                      stake_micros=stake_m, payout_micros=payout,
                      outcome="win" if payout > 0 else "lose",
                      detail=json.dumps({"risk": req.risk, "roll": str(out.roll),
                                         "segment": out.segment,
                                         "multiplier": str(out.multiplier)}))
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "wheel_spin", rnd.id,
                                  f"wheel:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, payout, "wheel_spin", rnd.id,
               f"wheel:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "nonce": nonce, "roll": str(out.roll),
            "risk": req.risk, "segment": out.segment,
            "multiplier": str(out.multiplier),
            "payout": str(from_micros(payout)),
            "balance": str(from_micros(balance))}


# ------------------------------------------------------------------ slots ----
class SlotRequest(BaseModel):
    stake: str
    machine: str
    idempotency_key: str | None = None


@router.post("/slots/spin")
async def slot_spin(req: SlotRequest, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    if req.machine not in E.SLOT_MACHINES:
        raise HTTPException(404, "no such machine")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    out = E.slot_spin(pair.server_seed, pair.client_seed, nonce, req.machine)
    payout = payout_micros(stake_m, out.multiplier)

    rnd = CasinoRound(game="slots", user_id=user.id, seed_pair_id=pair.id, nonce=nonce,
                      stake_micros=stake_m, payout_micros=payout,
                      outcome="win" if payout > 0 else "lose",
                      detail=json.dumps({"machine": req.machine, "reels": out.reels,
                                         "multiplier": str(out.multiplier)}))
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "slot_spin", rnd.id,
                                  f"slot:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, payout, "slot_spin", rnd.id,
               f"slot:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "nonce": nonce, "machine": req.machine,
            "reels": out.reels, "multiplier": str(out.multiplier),
            "win": payout > 0,
            "payout": str(from_micros(payout)),
            "balance": str(from_micros(balance))}


# -------------------------------------------------------------- blackjack ----
def _bj_state(rnd: CasinoRound) -> dict:
    return json.loads(rnd.detail)


def _bj_public(rnd: CasinoRound, st: dict, done: bool) -> dict:
    dealer = st["dealer"] if done else st["dealer"][:1]
    return {
        "round_id": rnd.id, "status": rnd.status, "outcome": rnd.outcome,
        "player": [E.card_name(c) for c in st["player"]],
        "player_total": E.best_total(st["player"]),
        "dealer": [E.card_name(c) for c in dealer] + ([] if done else ["??"]),
        "dealer_total": E.best_total(st["dealer"]) if done else None,
        "stake": str(from_micros(rnd.stake_micros)),
        "doubled": st.get("doubled", False),
        "can_double": (not done and len(st["player"]) == 2
                       and not st.get("doubled", False)),
        "payout": (str(from_micros(rnd.payout_micros))
                   if rnd.payout_micros is not None else None),
    }


async def _bj_finish(session, rnd: CasinoRound, st: dict, user_id: int,
                     natural: bool = False, player_bust: bool = False):
    deck = st["deck"]
    if not player_bust and not natural:
        st["dealer"], st["cursor"] = E.dealer_play(deck, st["dealer"], st["cursor"])
    payout = E.settle_blackjack(st["player"], st["dealer"], rnd.stake_micros, natural)
    rnd.payout_micros = payout
    rnd.status = "settled"
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.outcome = ("push" if payout == rnd.stake_micros and payout > 0
                   else "blackjack" if natural and payout > rnd.stake_micros
                   else "win" if payout > rnd.stake_micros else "lose")
    rnd.detail = json.dumps(st)
    wallet = await ledger.wallet_for(session, user_id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, payout, "blackjack_hand", rnd.id,
               f"bj:{rnd.id}:settle")


class BjDeal(BaseModel):
    stake: str
    idempotency_key: str | None = None


@router.post("/blackjack/deal")
async def bj_deal(req: BjDeal, user: User = Depends(betting_user),
                  session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    open_hand = (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user.id,
                                  CasinoRound.game == "blackjack",
                                  CasinoRound.status == "open"))).scalar_one_or_none()
    if open_hand:
        raise HTTPException(409, "finish your open hand first")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    deck = E.shuffled_deck(pair.server_seed, pair.client_seed, nonce)
    st = {"deck": deck, "player": [deck[0], deck[2]], "dealer": [deck[1], deck[3]],
          "cursor": 4, "doubled": False}

    rnd = CasinoRound(game="blackjack", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    await _charge(session, user, stake_m, "blackjack_hand", rnd.id,
                  f"bj:{rnd.id}:place:{key}")

    player_bj = E.best_total(st["player"]) == 21
    dealer_bj = E.best_total(st["dealer"]) == 21
    if player_bj or dealer_bj:
        await _bj_finish(session, rnd, st, user.id, natural=player_bj)
    out = _bj_public(rnd, st, rnd.status == "settled")
    wallet = await ledger.wallet_for(session, user.id)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


class BjAction(BaseModel):
    action: str            # hit | stand | double


@router.post("/blackjack/{round_id}/action")
async def bj_action(round_id: int, req: BjAction, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "blackjack":
        raise HTTPException(404, "no such hand")
    if rnd.status != "open":
        raise HTTPException(409, "that hand is finished")
    st = _bj_state(rnd)
    deck = st["deck"]

    if req.action == "double":
        if len(st["player"]) != 2 or st.get("doubled"):
            raise HTTPException(409, "double is only on your first two cards")
        await _charge(session, user, rnd.stake_micros, "blackjack_hand", rnd.id,
                      f"bj:{rnd.id}:double")
        rnd.stake_micros *= 2
        st["doubled"] = True
        st["player"].append(deck[st["cursor"]]); st["cursor"] += 1
        await _bj_finish(session, rnd, st, user.id,
                         player_bust=E.best_total(st["player"]) > 21)
    elif req.action == "hit":
        st["player"].append(deck[st["cursor"]]); st["cursor"] += 1
        if E.best_total(st["player"]) > 21:
            await _bj_finish(session, rnd, st, user.id, player_bust=True)
        else:
            rnd.detail = json.dumps(st)
    elif req.action == "stand":
        await _bj_finish(session, rnd, st, user.id)
    else:
        raise HTTPException(400, "action must be hit, stand or double")

    out = _bj_public(rnd, _bj_state(rnd), rnd.status == "settled")
    wallet = await ledger.wallet_for(session, user.id)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.get("/blackjack/active")
async def bj_active(user: User = Depends(current_user),
                    session: AsyncSession = Depends(get_session)):
    rnd = (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user.id,
                                  CasinoRound.game == "blackjack",
                                  CasinoRound.status == "open"))).scalar_one_or_none()
    await session.commit()
    if rnd is None:
        return {"active": None}
    return {"active": _bj_public(rnd, _bj_state(rnd), False)}


# --------------------------------------------------------------- roulette ----
class RouletteBet(BaseModel):
    kind: str
    pick: int | None = None
    stake: str


class RouletteRequest(BaseModel):
    bets: list[RouletteBet]
    idempotency_key: str | None = None


@router.post("/roulette/spin")
async def roulette_spin(req: RouletteRequest, user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    if not 1 <= len(req.bets) <= 15:
        raise HTTPException(400, "place between 1 and 15 bets per spin")
    parsed = []
    for b in req.bets:
        if b.kind not in E.ROULETTE_KINDS:
            raise HTTPException(400, f"unknown bet {b.kind}")
        if b.kind == "straight" and not (b.pick is not None and 0 <= b.pick <= 36):
            raise HTTPException(400, "straight bets pick a number 0-36")
        if b.kind in ("dozen", "column") and not (b.pick is not None and 0 <= b.pick <= 2):
            raise HTTPException(400, f"{b.kind} bets pick 0, 1 or 2")
        parsed.append((b.kind, b.pick, _stake_or_400(b.stake, user)))
    total = sum(s for _, _, s in parsed)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    pocket = E.roulette_pocket(pair.server_seed, pair.client_seed, nonce)
    payout = sum(payout_micros(s, E.roulette_pays(k, p, pocket))
                 for k, p, s in parsed)

    rnd = CasinoRound(game="roulette", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=total, payout_micros=payout,
                      outcome="win" if payout > 0 else "lose",
                      detail=json.dumps({"pocket": pocket,
                                         "bets": [{"kind": k, "pick": p,
                                                   "stake": str(from_micros(s))}
                                                  for k, p, s in parsed]}))
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, total, "roulette_spin", rnd.id,
                                  f"rl:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, payout, "roulette_spin", rnd.id,
               f"rl:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "nonce": nonce, "pocket": pocket,
            "color": ("green" if pocket == 0
                      else "red" if pocket in E.ROULETTE_RED else "black"),
            "payout": str(from_micros(payout)),
            "balance": str(from_micros(balance))}


# ------------------------------------------------------------ video poker ----
async def _open_round(session, user_id: int, game: str) -> CasinoRound | None:
    return (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user_id,
                                  CasinoRound.game == game,
                                  CasinoRound.status == "open"))).scalar_one_or_none()


class VpDeal(BaseModel):
    stake: str
    idempotency_key: str | None = None


@router.post("/vp/deal")
async def vp_deal(req: VpDeal, user: User = Depends(betting_user),
                  session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    if await _open_round(session, user.id, "videopoker"):
        raise HTTPException(409, "finish your open hand first")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    deck = E.shuffled_deck(pair.server_seed, pair.client_seed, nonce)
    st = {"deck": deck, "hand": deck[:5], "cursor": 5}

    rnd = CasinoRound(game="videopoker", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, "vp_hand", rnd.id,
                              f"vp:{rnd.id}:place:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "hand": [E.card_name(c) for c in st["hand"]],
            "stake": str(from_micros(stake_m)),
            "paytable": [[n, str(m)] for n, m in E.VP_PAYTABLE],
            "balance": str(from_micros(balance))}


class VpDraw(BaseModel):
    holds: list[bool]


@router.post("/vp/{round_id}/draw")
async def vp_draw(round_id: int, req: VpDraw, user: User = Depends(betting_user),
                  session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "videopoker":
        raise HTTPException(404, "no such hand")
    if rnd.status != "open":
        raise HTTPException(409, "that hand is finished")
    if len(req.holds) != 5:
        raise HTTPException(400, "holds must list all five cards")
    st = json.loads(rnd.detail)
    hand, cursor = list(st["hand"]), st["cursor"]
    for i, keep in enumerate(req.holds):
        if not keep:
            hand[i] = st["deck"][cursor]; cursor += 1
    name, mult = E.vp_evaluate(hand)
    payout = payout_micros(rnd.stake_micros, mult)
    rnd.status = "settled"; rnd.outcome = name
    rnd.payout_micros = payout
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps({"hand": hand, "held": req.holds, "result": name})
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, payout, "vp_hand", rnd.id,
               f"vp:{rnd.id}:settle")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "hand": [E.card_name(c) for c in hand],
            "result": name, "multiplier": str(mult),
            "payout": str(from_micros(payout)),
            "balance": str(from_micros(balance))}


@router.get("/vp/active")
async def vp_active(user: User = Depends(current_user),
                    session: AsyncSession = Depends(get_session)):
    rnd = await _open_round(session, user.id, "videopoker")
    await session.commit()
    if rnd is None:
        return {"active": None}
    st = json.loads(rnd.detail)
    return {"active": {"round_id": rnd.id,
                       "hand": [E.card_name(c) for c in st["hand"]],
                       "stake": str(from_micros(rnd.stake_micros)),
                       "paytable": [[n, str(m)] for n, m in E.VP_PAYTABLE]}}


# --------------------------------------------------------------- baccarat ----
class BaccRequest(BaseModel):
    bet: str               # player | banker | tie
    stake: str
    idempotency_key: str | None = None


@router.post("/baccarat/deal")
async def baccarat_deal(req: BaccRequest, user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    if req.bet not in ("player", "banker", "tie"):
        raise HTTPException(400, "bet must be player, banker or tie")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    shoe = E.baccarat_shoe(pair.server_seed, pair.client_seed, nonce)
    d = E.baccarat_deal(shoe)
    mult = E.baccarat_pays(req.bet, d["outcome"])
    payout = payout_micros(stake_m, mult)

    rnd = CasinoRound(game="baccarat", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, payout_micros=payout,
                      outcome=("push" if payout == stake_m and payout > 0
                               else "win" if payout > stake_m else "lose"),
                      detail=json.dumps({"bet": req.bet, "outcome": d["outcome"],
                                         "player": d["player"], "banker": d["banker"],
                                         "pt": d["player_total"], "bt": d["banker_total"]}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "baccarat_coup", rnd.id,
                                  f"bc:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, payout, "baccarat_coup", rnd.id,
               f"bc:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "nonce": nonce, "bet": req.bet,
            "player": [E.card_name(c) for c in d["player"]],
            "banker": [E.card_name(c) for c in d["banker"]],
            "player_total": d["player_total"], "banker_total": d["banker_total"],
            "outcome": d["outcome"], "multiplier": str(mult),
            "payout": str(from_micros(payout)),
            "balance": str(from_micros(balance))}


# ----------------------------------------------------------------- plinko ----
class PlinkoRequest(BaseModel):
    stake: str
    rows: int
    risk: str
    idempotency_key: str | None = None


@router.post("/plinko/drop")
async def plinko_drop(req: PlinkoRequest, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    if req.rows not in E.PLINKO_ROWS:
        raise HTTPException(400, f"rows must be one of {E.PLINKO_ROWS}")
    if req.risk not in ("low", "medium", "high"):
        raise HTTPException(400, "risk must be low, medium or high")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    out = E.plinko_play(pair.server_seed, pair.client_seed, nonce, req.rows, req.risk)
    payout = payout_micros(stake_m, out.multiplier)

    rnd = CasinoRound(game="plinko", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, payout_micros=payout,
                      outcome="win" if payout > 0 else "lose",
                      detail=json.dumps({"rows": req.rows, "risk": req.risk,
                                         "path": out.path, "bucket": out.bucket,
                                         "multiplier": str(out.multiplier)}))
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "plinko_drop", rnd.id,
                                  f"pk:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, payout, "plinko_drop", rnd.id,
               f"pk:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "nonce": nonce, "rows": req.rows, "risk": req.risk,
            "path": out.path, "bucket": out.bucket,
            "multiplier": str(out.multiplier),
            "payout": str(from_micros(payout)),
            "balance": str(from_micros(balance))}


# ------------------------------------------------------------ hold & spin ----
class HoldSpinReq(BaseModel):
    stake: str
    idempotency_key: str | None = None


async def _hs_open(session, user_id: int):
    return (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user_id,
                                  CasinoRound.game == "holdspin",
                                  CasinoRound.status == "open"))).scalar_one_or_none()


def _hs_public(rnd, st, extra=None):
    out = {"round_id": rnd.id, "status": rnd.status,
           "locked": st["locked"], "respins": st["respins"],
           "stake": str(from_micros(rnd.stake_micros)),
           "collected": str(from_micros(st["collected"]))}
    if extra:
        out.update(extra)
    return out


@router.post("/holdspin/spin")
async def holdspin_spin(req: HoldSpinReq, user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    from . import holdspin as HS
    _casino_gate(user)
    if await _hs_open(session, user.id):
        raise HTTPException(409, "finish your respins first")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    b = HS.base_spin(pair.server_seed, pair.client_seed, nonce)
    win = sum(payout_micros(stake_m, Decimal(v)) for v in b.coins.values())

    st = {"locked": {str(c): v for c, v in b.coins.items()},
          "respins": HS.RESPINS, "collected": win}
    rnd = CasinoRound(game="holdspin", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m,
                      status="open" if b.triggered else "settled",
                      outcome="feature" if b.triggered
                              else ("win" if win > 0 else "lose"),
                      payout_micros=None if b.triggered else win,
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "holdspin_spin", rnd.id,
                                  f"hs:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, win, "holdspin_spin", rnd.id,
               f"hs:{rnd.id}:base:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return _hs_public(rnd, st, {"coins": b.coins, "win": str(from_micros(win)),
                                "triggered": b.triggered,
                                "balance": str(from_micros(balance))})


@router.post("/holdspin/respin")
async def holdspin_respin(user: User = Depends(betting_user),
                          session: AsyncSession = Depends(get_session)):
    from . import holdspin as HS
    rnd = await _hs_open(session, user.id)
    if rnd is None:
        raise HTTPException(404, "no feature in play")
    st = json.loads(rnd.detail)
    locked_cells = [int(c) for c in st["locked"]]

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    new = HS.respin(pair.server_seed, pair.client_seed, nonce, locked_cells)
    win = sum(payout_micros(rnd.stake_micros, Decimal(v)) for v in new.values())

    for c, v in new.items():
        st["locked"][str(c)] = v
    if new:
        st["respins"] = HS.RESPINS
    else:
        st["respins"] -= 1
    st["collected"] += win

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, win, "holdspin_spin", rnd.id,
               f"hs:{rnd.id}:rs:{nonce}")

    grand = 0
    full = len(st["locked"]) >= HS.CELLS
    if full:
        grand = payout_micros(rnd.stake_micros, HS.GRAND_MULT * HS._scale)
        st["collected"] += grand
        await _pay(session, house, wallet, grand, "holdspin_spin", rnd.id,
                   f"hs:{rnd.id}:grand")
    if full or st["respins"] <= 0:
        rnd.status = "settled"
        rnd.outcome = "grand" if full else "feature_done"
        rnd.payout_micros = st["collected"]
        rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return _hs_public(rnd, st, {"coins": new, "win": str(from_micros(win)),
                                "grand": str(from_micros(grand)),
                                "balance": str(from_micros(balance))})


@router.get("/holdspin/active")
async def holdspin_active(user: User = Depends(current_user),
                          session: AsyncSession = Depends(get_session)):
    rnd = await _hs_open(session, user.id)
    await session.commit()
    if rnd is None:
        return {"active": None}
    return {"active": _hs_public(rnd, json.loads(rnd.detail))}


# -------------------------------------------------------- golden dragon ----
async def _dr_open(session, user_id: int):
    return (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user_id,
                                  CasinoRound.game == "dragon",
                                  CasinoRound.status == "open"))).scalar_one_or_none()


def _dr_public(rnd, st, extra=None):
    out = {"round_id": rnd.id, "status": rnd.status,
           "locked": st["locked"], "respins": st["respins"],
           "stake": str(from_micros(rnd.stake_micros)),
           "collected": str(from_micros(st["collected"]))}
    if extra:
        out.update(extra)
    return out


def _dr_coin_win(stake_m: int, coins: dict) -> int:
    from . import dragon as DR
    return sum(payout_micros(stake_m, DR.coin_multiplier(v))
               for v in coins.values())


async def _dr_start(session, user, stake_m, spin, charge_m, tag, key):
    """Shared open-a-round path for a paid spin and a bonus buy."""
    from . import dragon as DR
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    b = spin(pair.server_seed, pair.client_seed, nonce)
    win = _dr_coin_win(stake_m, b.coins)

    st = {"locked": {str(c): v for c, v in b.coins.items()},
          "respins": DR.RESPINS, "collected": win}
    rnd = CasinoRound(game="dragon", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m,
                      status="open" if b.triggered else "settled",
                      outcome="feature" if b.triggered
                              else ("win" if win > 0 else "lose"),
                      payout_micros=None if b.triggered else win,
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    wallet, house = await _charge(session, user, charge_m, "dragon_spin",
                                  rnd.id, f"dr:{rnd.id}:{tag}:{key}")
    await _pay(session, house, wallet, win, "dragon_spin", rnd.id,
               f"dr:{rnd.id}:base:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return _dr_public(rnd, st, {"coins": b.coins, "win": str(from_micros(win)),
                                "triggered": b.triggered,
                                "balance": str(from_micros(balance))})


@router.post("/dragon/spin")
async def dragon_spin(req: HoldSpinReq, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    from . import dragon as DR
    _casino_gate(user)
    if await _dr_open(session, user.id):
        raise HTTPException(409, "finish your respins first")
    stake_m = _stake_or_400(req.stake, user)
    key = req.idempotency_key or secrets.token_hex(8)
    return await _dr_start(session, user, stake_m, DR.base_spin,
                           stake_m, "place", key)


@router.post("/dragon/buy")
async def dragon_buy(req: HoldSpinReq, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    """Buy Bonus: pay the printed multiple of your bet, the trigger is
    guaranteed. Priced off the exact feature EV -- house keeps its cut."""
    from . import dragon as DR
    _casino_gate(user)
    if await _dr_open(session, user.id):
        raise HTTPException(409, "finish your respins first")
    stake_m = _stake_or_400(req.stake, user)
    total = payout_micros(stake_m, DR.buy_cost_mult())
    cap = (user.wager_limit_micros or to_micros(Decimal(settings.max_bet_credits)))
    if total > cap:
        raise HTTPException(400,
            f"that buy costs {DR.buy_cost_mult()}x your bet — over your "
            f"wager limit; lower the bet")
    key = req.idempotency_key or secrets.token_hex(8)
    out = await _dr_start(session, user, stake_m, DR.buy_spin,
                          total, "buy", key)
    out["cost"] = str(from_micros(total))
    return out


@router.post("/dragon/respin")
async def dragon_respin(user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    from . import dragon as DR
    rnd = await _dr_open(session, user.id)
    if rnd is None:
        raise HTTPException(404, "no feature in play")
    st = json.loads(rnd.detail)
    locked_cells = [int(c) for c in st["locked"]]

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    new = DR.respin(pair.server_seed, pair.client_seed, nonce, locked_cells)
    win = _dr_coin_win(rnd.stake_micros, new)

    for c, v in new.items():
        st["locked"][str(c)] = v
    if new:
        st["respins"] = DR.RESPINS
    else:
        st["respins"] -= 1
    st["collected"] += win

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, win, "dragon_spin", rnd.id,
               f"dr:{rnd.id}:rs:{nonce}")

    grand = 0
    full = len(st["locked"]) >= DR.CELLS
    if full:
        grand = payout_micros(rnd.stake_micros, DR.GRAND_MULT)
        st["collected"] += grand
        await _pay(session, house, wallet, grand, "dragon_spin", rnd.id,
                   f"dr:{rnd.id}:grand")
    if full or st["respins"] <= 0:
        rnd.status = "settled"
        rnd.outcome = "grand" if full else "feature_done"
        rnd.payout_micros = st["collected"]
        rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return _dr_public(rnd, st, {"coins": new, "win": str(from_micros(win)),
                                "grand": str(from_micros(grand)),
                                "balance": str(from_micros(balance))})


@router.get("/dragon/active")
async def dragon_active(user: User = Depends(current_user),
                        session: AsyncSession = Depends(get_session)):
    rnd = await _dr_open(session, user.id)
    await session.commit()
    if rnd is None:
        return {"active": None}
    return {"active": _dr_public(rnd, json.loads(rnd.detail))}


# ------------------------------------------------------------ sugar blast ----
class TumbleReq(BaseModel):
    stake: str
    idempotency_key: str | None = None


async def _tb_open(session, user_id: int):
    return (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user_id,
                                  CasinoRound.game == "tumble",
                                  CasinoRound.status == "open"))).scalar_one_or_none()


def _tb_capped(stake_m: int, win: int, already: int) -> int:
    """Round wins stop at the printed max; the cap is on total round pay."""
    from . import tumble as T
    room = payout_micros(stake_m, T.MAX_WIN_MULT) - already
    return max(0, min(win, room))


def _tb_result_public(r) -> dict:
    return {"grids": r.grids, "steps": r.steps, "scatters": r.scatters,
            "bomb_sum": str(r.bomb_sum), "total_mult": str(r.total),
            "triggered": r.triggered}


@router.post("/tumble/spin")
async def tumble_spin(req: TumbleReq, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    from . import tumble as T
    _casino_gate(user)
    open_rnd = await _tb_open(session, user.id)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)

    if open_rnd is not None:
        # a FREE spin: bombs stick and multiply the chain's win
        st = json.loads(open_rnd.detail)
        r = T.free_spin(pair.server_seed, pair.client_seed, nonce)
        win = payout_micros(open_rnd.stake_micros, T.fs_win(r))
        win = _tb_capped(open_rnd.stake_micros, win, st["total_win"])
        st["spins_left"] -= 1
        st["total_win"] += win
        wallet = await ledger.wallet_for(session, user.id)
        house = await ledger.house_account(session)
        await _pay(session, house, wallet, win, "tumble_spin", open_rnd.id,
                   f"tb:{open_rnd.id}:fs:{st['spins_left']}")
        if st["spins_left"] <= 0:
            open_rnd.status = "settled"
            open_rnd.outcome = "bonus_done"
            open_rnd.payout_micros = st["total_win"]
            open_rnd.settled_at = datetime.now(timezone.utc)
        open_rnd.detail = json.dumps(st)
        balance = await ledger.balance_of(session, wallet.id)
        await session.commit()
        return {"round_id": open_rnd.id, "free_spin": True,
                **_tb_result_public(r),
                "win": str(from_micros(win)),
                "free_spins_left": st["spins_left"],
                "bonus_total": str(from_micros(st["total_win"])),
                "balance": str(from_micros(balance))}

    # a PAID spin
    stake_m = _stake_or_400(req.stake, user)
    r = T.base_spin(pair.server_seed, pair.client_seed, nonce)
    win = payout_micros(stake_m, r.total + T.scatter_pay(r.scatters))
    win = _tb_capped(stake_m, win, 0)

    rnd = CasinoRound(game="tumble", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m,
                      status="open" if r.triggered else "settled",
                      outcome="bonus" if r.triggered
                              else ("win" if win > 0 else "lose"),
                      payout_micros=None if r.triggered else win,
                      detail=json.dumps({
                          "spins_left": T.FREE_SPINS if r.triggered else 0,
                          "total_win": win}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "tumble_spin", rnd.id,
                                  f"tb:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, win, "tumble_spin", rnd.id,
               f"tb:{rnd.id}:base:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "free_spin": False,
            **_tb_result_public(r),
            "win": str(from_micros(win)),
            "free_spins_left": T.FREE_SPINS if r.triggered else 0,
            "bonus_total": "0",
            "balance": str(from_micros(balance))}


@router.post("/tumble/buy")
async def tumble_buy(req: TumbleReq, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    """Buy Bonus: pay the printed multiple, the scatters are guaranteed."""
    from . import tumble as T
    _casino_gate(user)
    if await _tb_open(session, user.id):
        raise HTTPException(409, "finish your free spins first")
    stake_m = _stake_or_400(req.stake, user)
    total = payout_micros(stake_m, T.BUY_COST_MULT)
    cap = (user.wager_limit_micros or to_micros(Decimal(settings.max_bet_credits)))
    if total > cap:
        raise HTTPException(400,
            f"that buy costs {T.BUY_COST_MULT}x your bet — over your wager "
            f"limit; lower the bet")

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    r = T.buy_spin(pair.server_seed, pair.client_seed, nonce)
    win = payout_micros(stake_m, r.total + T.scatter_pay(r.scatters))
    win = _tb_capped(stake_m, win, 0)

    rnd = CasinoRound(game="tumble", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      outcome="bonus_bought",
                      detail=json.dumps({"spins_left": T.FREE_SPINS,
                                         "total_win": win, "bought": True}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, total, "tumble_spin", rnd.id,
                                  f"tb:{rnd.id}:buy:{key}")
    await _pay(session, house, wallet, win, "tumble_spin", rnd.id,
               f"tb:{rnd.id}:base:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "free_spin": False,
            **_tb_result_public(r),
            "cost": str(from_micros(total)),
            "win": str(from_micros(win)),
            "free_spins_left": T.FREE_SPINS,
            "bonus_total": str(from_micros(win)),
            "balance": str(from_micros(balance))}


@router.get("/tumble/active")
async def tumble_active(user: User = Depends(current_user),
                        session: AsyncSession = Depends(get_session)):
    rnd = await _tb_open(session, user.id)
    await session.commit()
    if rnd is None:
        return {"active": None}
    st = json.loads(rnd.detail)
    return {"active": {"round_id": rnd.id,
                       "stake": str(from_micros(rnd.stake_micros)),
                       "free_spins_left": st["spins_left"],
                       "bonus_total": str(from_micros(st["total_win"]))}}


# ----------------------------------------------------------- video slots ----
class VSlotRequest(BaseModel):
    stake: str
    machine: str
    idempotency_key: str | None = None


@router.post("/vslots/spin")
async def vslot_spin(req: VSlotRequest, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    from . import videoslots as VS
    _casino_gate(user)
    if req.machine not in VS.VIDEO_SLOTS:
        raise HTTPException(404, "no such machine")
    m = VS.VIDEO_SLOTS[req.machine]
    fs_conf = m["free_spins"]

    open_rnd = (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user.id,
                                  CasinoRound.game == "vslot",
                                  CasinoRound.status == "open"))).scalar_one_or_none()

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)

    if open_rnd is not None:
        # a FREE spin: no charge, wins ride the bonus multiplier
        st = json.loads(open_rnd.detail)
        if st["machine"] != req.machine:
            raise HTTPException(409,
                f"finish your bonus on {VS.VIDEO_SLOTS[st['machine']]['name']} first")
        out = VS.spin(pair.server_seed, pair.client_seed, nonce, req.machine)
        line_bet = open_rnd.stake_micros // 20
        win = payout_micros(line_bet, out.total_pay * fs_conf["mult"])
        st["spins_left"] -= 1
        st["total_win"] += win
        wallet = await ledger.wallet_for(session, user.id)
        house = await ledger.house_account(session)
        await _pay(session, house, wallet, win, "vslot_spin", open_rnd.id,
                   f"vs:{open_rnd.id}:fs:{st['spins_left']}")
        free_left = st["spins_left"]
        if free_left <= 0:
            open_rnd.status = "settled"
            open_rnd.outcome = "bonus_done"
            open_rnd.payout_micros = st["total_win"]
            open_rnd.settled_at = datetime.now(timezone.utc)
        open_rnd.detail = json.dumps(st)
        balance = await ledger.balance_of(session, wallet.id)
        await session.commit()
        return {"round_id": open_rnd.id, "free_spin": True,
                "grid": out.grid, "line_wins": out.line_wins,
                "scatters": out.scatters, "mult": fs_conf["mult"],
                "win": str(from_micros(win)), "free_spins_left": free_left,
                "bonus_total": str(from_micros(st["total_win"])),
                "balance": str(from_micros(balance))}

    # a PAID spin
    stake_m = _stake_or_400(req.stake, user)
    out = VS.spin(pair.server_seed, pair.client_seed, nonce, req.machine)
    line_bet = stake_m // 20
    win = payout_micros(line_bet, out.total_pay)

    rnd = CasinoRound(game="vslot", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m,
                      status="open" if out.triggered else "settled",
                      outcome="bonus" if out.triggered
                              else ("win" if win > 0 else "lose"),
                      payout_micros=None if out.triggered else win,
                      detail=json.dumps({"machine": req.machine,
                                         "spins_left": fs_conf["count"] if out.triggered else 0,
                                         "total_win": win}))
    session.add(rnd)
    await session.flush()

    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "vslot_spin", rnd.id,
                                  f"vs:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, win, "vslot_spin", rnd.id,
               f"vs:{rnd.id}:base:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "free_spin": False,
            "grid": out.grid, "line_wins": out.line_wins,
            "scatters": out.scatters, "mult": 1,
            "win": str(from_micros(win)),
            "free_spins_left": fs_conf["count"] if out.triggered else 0,
            "bonus_total": "0",
            "balance": str(from_micros(balance))}


class VSlotBuy(BaseModel):
    stake: str
    machine: str
    idempotency_key: str | None = None


@router.post("/vslots/buy")
async def vslot_buy(req: VSlotBuy, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    """Bonus Buy: pay the printed multiple of your bet, go straight to the
    free spins. Priced off the exact bonus EV, so the house holds its usual
    cut on the buy too."""
    from . import videoslots as VS
    _casino_gate(user)
    if req.machine not in VS.VIDEO_SLOTS:
        raise HTTPException(404, "no such machine")
    open_rnd = (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user.id,
                                  CasinoRound.game == "vslot",
                                  CasinoRound.status == "open"))).scalar_one_or_none()
    if open_rnd is not None:
        raise HTTPException(409, "finish your open bonus first")

    m = VS.VIDEO_SLOTS[req.machine]
    stake_m = _stake_or_400(req.stake, user)
    cost_mult = VS.buy_cost_mult(m)
    total = stake_m * cost_mult
    cap = (user.wager_limit_micros or to_micros(Decimal(settings.max_bet_credits)))
    if total > cap:
        raise HTTPException(400,
            f"that buy costs {cost_mult}x your bet — over your wager limit; lower the bet")

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    rnd = CasinoRound(game="vslot", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      outcome="bonus_bought",
                      detail=json.dumps({"machine": req.machine,
                                         "spins_left": m["free_spins"]["count"],
                                         "total_win": 0, "bought": True}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, total, "vslot_spin", rnd.id,
                              f"vs:{rnd.id}:buy:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "machine": req.machine,
            "cost": str(from_micros(total)),
            "free_spins_left": m["free_spins"]["count"],
            "mult": m["free_spins"]["mult"],
            "balance": str(from_micros(balance))}


@router.get("/vslots/active")
async def vslot_active(user: User = Depends(current_user),
                       session: AsyncSession = Depends(get_session)):
    rnd = (await session.execute(
        select(CasinoRound).where(CasinoRound.user_id == user.id,
                                  CasinoRound.game == "vslot",
                                  CasinoRound.status == "open"))).scalar_one_or_none()
    await session.commit()
    if rnd is None:
        return {"active": None}
    st = json.loads(rnd.detail)
    return {"active": {"round_id": rnd.id, "machine": st["machine"],
                       "free_spins_left": st["spins_left"],
                       "bonus_total": str(from_micros(st["total_win"])),
                       "stake": str(from_micros(rnd.stake_micros))}}


# ------------------------------------------------------------------ mines ----
class MinesStart(BaseModel):
    stake: str
    mines: int
    idempotency_key: str | None = None


def _mines_public(rnd: CasinoRound, st: dict, done: bool) -> dict:
    m, revealed = st["mines"], st["revealed"]
    out = {
        "round_id": rnd.id, "status": rnd.status, "outcome": rnd.outcome,
        "mines": m, "revealed": revealed,
        "stake": str(from_micros(rnd.stake_micros)),
        "multiplier": str(E.mines_multiplier(m, len(revealed))),
        "next_multiplier": (str(E.mines_multiplier(m, len(revealed) + 1))
                            if len(revealed) < E.MINES_GRID - m else None),
        "payout": (str(from_micros(rnd.payout_micros))
                   if rnd.payout_micros is not None else None),
    }
    if done:
        out["layout"] = st["layout"]
    return out


@router.post("/mines/start")
async def mines_start(req: MinesStart, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    if await _open_round(session, user.id, "mines"):
        raise HTTPException(409, "finish your open board first")
    if not 1 <= req.mines <= 24:
        raise HTTPException(400, "mines must be 1-24")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    layout = E.mines_layout(pair.server_seed, pair.client_seed, nonce, req.mines)
    st = {"mines": req.mines, "layout": layout, "revealed": []}

    rnd = CasinoRound(game="mines", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, "mines_round", rnd.id,
                              f"mn:{rnd.id}:place:{key}")
    out = _mines_public(rnd, st, False)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


class MinesReveal(BaseModel):
    cell: int


@router.post("/mines/{round_id}/reveal")
async def mines_reveal(round_id: int, req: MinesReveal,
                       user: User = Depends(betting_user),
                       session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "mines":
        raise HTTPException(404, "no such board")
    if rnd.status != "open":
        raise HTTPException(409, "that board is finished")
    if not 0 <= req.cell < E.MINES_GRID:
        raise HTTPException(400, "cell must be 0-24")
    st = json.loads(rnd.detail)
    if req.cell in st["revealed"]:
        raise HTTPException(409, "already revealed")

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    if req.cell in st["layout"]:
        rnd.status = "settled"; rnd.outcome = "bust"; rnd.payout_micros = 0
        rnd.settled_at = datetime.now(timezone.utc)
        rnd.detail = json.dumps(st)
    else:
        st["revealed"].append(req.cell)
        rnd.detail = json.dumps(st)
        if len(st["revealed"]) == E.MINES_GRID - st["mines"]:
            mult = E.mines_multiplier(st["mines"], len(st["revealed"]))
            rnd.payout_micros = payout_micros(rnd.stake_micros, mult)
            rnd.status = "settled"; rnd.outcome = "cleared"
            rnd.settled_at = datetime.now(timezone.utc)
            await _pay(session, house, wallet, rnd.payout_micros, "mines_round",
                       rnd.id, f"mn:{rnd.id}:settle")
    out = _mines_public(rnd, st, rnd.status == "settled")
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.post("/mines/{round_id}/cashout")
async def mines_cashout(round_id: int, user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "mines":
        raise HTTPException(404, "no such board")
    if rnd.status != "open":
        raise HTTPException(409, "that board is finished")
    st = json.loads(rnd.detail)
    if not st["revealed"]:
        raise HTTPException(409, "reveal at least one tile before cashing out")
    mult = E.mines_multiplier(st["mines"], len(st["revealed"]))
    rnd.payout_micros = payout_micros(rnd.stake_micros, mult)
    rnd.status = "settled"; rnd.outcome = "cashout"
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, rnd.payout_micros, "mines_round",
               rnd.id, f"mn:{rnd.id}:settle")
    out = _mines_public(rnd, st, True)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.get("/mines/active")
async def mines_active(user: User = Depends(current_user),
                       session: AsyncSession = Depends(get_session)):
    rnd = await _open_round(session, user.id, "mines")
    await session.commit()
    if rnd is None:
        return {"active": None}
    return {"active": _mines_public(rnd, json.loads(rnd.detail), False)}


# ------------------------------------------------------------------ crash ----
class CrashStart(BaseModel):
    stake: str
    auto: str | None = None       # auto-cashout target, e.g. "2.00"
    idempotency_key: str | None = None


@router.post("/crash/start")
async def crash_start(req: CrashStart, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    _casino_gate(user)
    if await _open_round(session, user.id, "crash"):
        raise HTTPException(409, "you already have a rocket in the air")
    stake_m = _stake_or_400(req.stake, user)
    auto = None
    if req.auto is not None:
        try:
            auto = Decimal(req.auto)
        except InvalidOperation:
            raise HTTPException(400, "auto-cashout is not a number")
        if not Decimal("1.01") <= auto <= E.CRASH_CAP:
            raise HTTPException(400, f"auto-cashout must be 1.01-{E.CRASH_CAP}")

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    point = E.crash_point(pair.server_seed, pair.client_seed, nonce)

    rnd = CasinoRound(game="crash", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps({"point": str(point),
                                         "auto": str(auto) if auto else None}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "crash_round", rnd.id,
                                  f"cr:{rnd.id}:place:{key}")

    if auto is not None:
        won = auto <= point
        rnd.payout_micros = payout_micros(stake_m, auto) if won else 0
        rnd.status = "settled"
        rnd.outcome = f"cashout {auto}x" if won else "bust"
        rnd.settled_at = datetime.now(timezone.utc)
        await _pay(session, house, wallet, rnd.payout_micros, "crash_round",
                   rnd.id, f"cr:{rnd.id}:settle")
        balance = await ledger.balance_of(session, wallet.id)
        await session.commit()
        return {"round_id": rnd.id, "status": "settled", "point": str(point),
                "won": won, "multiplier": str(auto) if won else None,
                "payout": str(from_micros(rnd.payout_micros)),
                "balance": str(from_micros(balance))}

    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "status": "open",
            "rate": E.CRASH_RATE,
            "started_at": rnd.created_at.isoformat(),
            "balance": str(from_micros(balance))}


@router.post("/crash/{round_id}/cashout")
async def crash_cashout(round_id: int, user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "crash":
        raise HTTPException(404, "no such round")
    if rnd.status != "open":
        raise HTTPException(409, "that round is finished")
    st = json.loads(rnd.detail)
    point = Decimal(st["point"])
    started = rnd.created_at if rnd.created_at.tzinfo else rnd.created_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    cur = E.crash_multiplier_at(elapsed)

    won = cur < point
    rnd.payout_micros = payout_micros(rnd.stake_micros, cur) if won else 0
    rnd.status = "settled"
    rnd.outcome = f"cashout {cur}x" if won else "bust"
    rnd.settled_at = datetime.now(timezone.utc)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, rnd.payout_micros, "crash_round",
               rnd.id, f"cr:{rnd.id}:settle")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "status": "settled", "point": str(point),
            "won": won, "multiplier": str(cur) if won else None,
            "payout": str(from_micros(rnd.payout_micros)),
            "balance": str(from_micros(balance))}


@router.get("/crash/history")
async def crash_history(user: User = Depends(current_user),
                        session: AsyncSession = Depends(get_session)):
    """The last busts, newest first -- the strip above the launch button."""
    rows = (await session.execute(
        select(CasinoRound).where(CasinoRound.game == "crash",
                                  CasinoRound.status == "settled")
        .order_by(CasinoRound.id.desc()).limit(15))).scalars().all()
    out = []
    for r in rows:
        try:
            out.append(json.loads(r.detail).get("point"))
        except ValueError:
            continue
    await session.commit()
    return {"points": [p for p in out if p]}


@router.post("/crash/{round_id}/state")
async def crash_state(round_id: int, user: User = Depends(current_user),
                      session: AsyncSession = Depends(get_session)):
    """The flight check. The moment the curve passes the secret point the
    round busts SERVER-SIDE -- whether or not the player is still watching --
    so a rocket can never hang in the air forever."""
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "crash":
        raise HTTPException(404, "no such round")
    st = json.loads(rnd.detail)
    point = Decimal(st["point"])
    if rnd.status != "open":
        return {"status": rnd.outcome or "settled", "point": str(point),
                "payout": str(from_micros(rnd.payout_micros or 0))}
    started = rnd.created_at if rnd.created_at.tzinfo else rnd.created_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    cur = E.crash_multiplier_at(elapsed)
    if cur >= point:
        rnd.payout_micros = 0
        rnd.status = "settled"
        rnd.outcome = "bust"
        rnd.settled_at = datetime.now(timezone.utc)
        await session.commit()
        return {"status": "bust", "point": str(point), "payout": "0"}
    await session.commit()
    return {"status": "flying", "elapsed": elapsed}


@router.get("/crash/active")
async def crash_active(user: User = Depends(current_user),
                       session: AsyncSession = Depends(get_session)):
    rnd = await _open_round(session, user.id, "crash")
    await session.commit()
    if rnd is None:
        return {"active": None}
    started = rnd.created_at if rnd.created_at.tzinfo else rnd.created_at.replace(tzinfo=timezone.utc)
    return {"active": {"round_id": rnd.id, "rate": E.CRASH_RATE,
                       "started_at": started.isoformat(),
                       "stake": str(from_micros(rnd.stake_micros))}}
