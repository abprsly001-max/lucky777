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
        ] + _arcade_entries(settings.min_bet_credits, mx),
    }


def _arcade_entries(mn: str, mx: str) -> list[dict]:
    from . import arcade as AR
    return [
        {"key": "keno", "name": "Keno", "icon": "🎱", "category": "quick",
         "min": mn, "max": mx,
         "rules": f"Pick up to {AR.KENO_MAX_PICKS} of {AR.KENO_POOL} numbers; "
                  f"{AR.KENO_DRAWN} balls drop. The more you catch, the "
                  f"bigger the pay — top catches hit {AR.KENO_CAP}x.",
         "keno": {"pool": AR.KENO_POOL, "drawn": AR.KENO_DRAWN,
                  "max_picks": AR.KENO_MAX_PICKS,
                  "tables": {str(p): {str(h): str(m) for h, m
                                      in AR.keno_paytable(p).items()}
                             for p in range(1, AR.KENO_MAX_PICKS + 1)}}},
        {"key": "limbo", "name": "Limbo", "icon": "🎯", "category": "quick",
         "min": mn, "max": mx,
         "rules": "Name your multiplier — any number from "
                  f"{AR.LIMBO_MIN}x to {AR.LIMBO_MAX}x. If the result beats "
                  "it, you're paid your number.",
         "limbo": {"min": str(AR.LIMBO_MIN), "max": str(AR.LIMBO_MAX)}},
        {"key": "towers", "name": "Towers", "icon": "🗼", "category": "quick",
         "min": mn, "max": mx,
         "rules": f"Climb {AR.TOWERS_ROWS} floors — one trap per floor. Every "
                  "clear floor raises the cash-out; hit the trap and it's gone.",
         "towers": {"rows": AR.TOWERS_ROWS,
                    "levels": {k: {"tiles": t,
                                   "mults": [str(AR.towers_mult(k, r))
                                             for r in range(1, AR.TOWERS_ROWS + 1)]}
                               for k, t in AR.TOWERS_LEVELS.items()}}},
        {"key": "dragontiger", "name": "Dragon Tiger", "icon": "🐯",
         "category": "table", "min": mn, "max": mx,
         "rules": "One card each. High card wins, even money; a rank tie pays "
                  f"the Tie {AR.DT_TIE_PAYS}:1 and gives half back on the "
                  "main bets. Ace low, king high."},
        {"key": "hilo", "name": "Hi-Lo", "icon": "🂱", "category": "table",
         "min": mn, "max": mx,
         "rules": "Call the next card higher or lower — every right call "
                  "multiplies at true odds. A tie loses, so press or cash out "
                  "whenever you like."},
        {"key": "lucky7", "name": "Lucky 7", "icon": "🎲", "category": "quick",
         "min": mn, "max": mx,
         "rules": "Two dice. Under 7 or over 7 pays 1.3:1; exactly 7 pays "
                  "4.75:1."},
        {"key": "rps", "name": "Rock Paper Scissors", "icon": "✊",
         "category": "quick", "min": mn, "max": mx,
         "rules": "Beat the house hand and get paid 0.92:1; a tie pushes."},
        {"key": "darts", "name": "Darts", "icon": "🎯", "category": "quick",
         "min": mn, "max": mx,
         "rules": "Call your ring before the throw. " + " · ".join(
             f"{r} pays {AR2_darts(r)}x" for r in
             ("bullseye", "inner", "middle", "outer")),
         "darts": {"rings": [{"ring": r, "mult": str(AR2_darts(r))}
                             for r, _ in _q().DARTS_RINGS]}},
        {"key": "prism", "name": "Prism", "icon": "💎", "category": "quick",
         "min": mn, "max": mx,
         "rules": "Spin the prism — land a gem and it pays its printed "
                  "multiple. Diamond tops the board.",
         "prism": {"segments": [{"gem": g, "mult": str(m)}
                                for g, _, m in _q().PRISM_SEGMENTS]}},
        {"key": "penalty", "name": "Penalty Shootout", "icon": "⚽",
         "category": "quick", "min": mn, "max": mx,
         "rules": "Bury penalties past the keeper — every goal multiplies, "
                  "one save ends the run. Cash out between kicks.",
         "ladder": _ladder_def("penalty")},
        {"key": "penguin", "name": "Penguin Dash", "icon": "🐧",
         "category": "quick", "min": mn, "max": mx,
         "rules": "Hop the ice floes ahead of the bear — every landing "
                  "multiplies, one slip ends the dash. Three difficulties.",
         "ladder": _ladder_def("penguin")},
        {"key": "acey", "name": "Acey Ducey", "icon": "🎴", "category": "table",
         "min": mn, "max": mx,
         "rules": "Two cards up — call the third strictly between or strictly "
                  "outside at true odds. Landing on a boundary card loses."},
        {"key": "war", "name": "War", "icon": "⚔", "category": "table",
         "min": mn, "max": mx,
         "rules": "High card wins even money. On a tie, surrender for half "
                  "back or go to WAR for a second stake — win the war and "
                  "collect on both."},
        {"key": "flip", "name": "10 Card Flip", "icon": "🃏",
         "category": "table", "min": mn, "max": mx,
         "rules": "Ten cards, five red, five black. Flip reds to build the "
                  "multiplier at true deck odds — one black ends the run. "
                  "Cash out any time."},
        {"key": "bus", "name": "Ride the Bus", "icon": "🚌",
         "category": "table", "min": mn, "max": mx,
         "rules": "Four calls: red or black, higher or lower, inside or "
                  "outside, then the suit. Each one multiplies — cash out "
                  "between stops or ride it all the way."},
        {"key": "suitlink", "name": "Suit Link", "icon": "🔗",
         "category": "quick", "min": mn, "max": mx,
         "rules": f"Pick your suit, two cards fall. Both match pays "
                  f"{_cd().SUIT_BOTH}x, one match pays {_cd().SUIT_ONE}x."},
        {"key": "hcf", "name": "High Card Flush", "icon": "🂡",
         "category": "table", "min": mn, "max": mx,
         "rules": "Five cards off a fresh deck — the longest suit is your "
                  "hand. " + " · ".join(
                      f"{k}-flush pays {m}x"
                      for k, m in sorted(_cd().hcf_paytable().items()))},
    ]


def _cd():
    from . import cards as CD
    return CD


def _q():
    from . import quick as Q
    return Q


def AR2_darts(ring: str) -> Decimal:
    return _q().darts_mult(ring)


def _ladder_def(game: str) -> dict:
    Q = _q()
    cfg = Q.LADDERS[game]
    return {"game": game, "levels": {
        lvl: {"p": str(cfg["step_p"][lvl]), "max_steps": cfg["max_steps"][lvl],
              "mults": [str(Q.ladder_mult(game, lvl, s))
                        for s in range(1, cfg["max_steps"][lvl] + 1)]}
        for lvl in cfg["levels"]}}


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


# ------------------------------------------------------------------- keno ----
class KenoReq(BaseModel):
    stake: str
    picks: list[int]
    idempotency_key: str | None = None


@router.post("/keno/play")
async def keno_play(req: KenoReq, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    _casino_gate(user)
    picks = sorted(set(req.picks))
    if not 1 <= len(picks) <= AR.KENO_MAX_PICKS:
        raise HTTPException(400, f"pick 1-{AR.KENO_MAX_PICKS} numbers")
    if any(not 1 <= p <= AR.KENO_POOL for p in picks):
        raise HTTPException(400, f"numbers are 1-{AR.KENO_POOL}")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    drawn = AR.keno_draw(pair.server_seed, pair.client_seed, nonce)
    hits = len(set(picks) & set(drawn))
    mult = AR.keno_paytable(len(picks)).get(hits, Decimal(0))
    win = payout_micros(stake_m, mult)

    rnd = CasinoRound(game="keno", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="settled",
                      outcome="win" if win > 0 else "lose", payout_micros=win,
                      detail=json.dumps({"picks": picks, "drawn": drawn,
                                         "hits": hits}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "keno_play", rnd.id,
                                  f"kn:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, win, "keno_play", rnd.id,
               f"kn:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "drawn": drawn, "picks": picks, "hits": hits,
            "multiplier": str(mult), "win": str(from_micros(win)),
            "balance": str(from_micros(balance))}


# ------------------------------------------------------------------ limbo ----
class LimboReq(BaseModel):
    stake: str
    target: str
    idempotency_key: str | None = None


@router.post("/limbo/play")
async def limbo_play(req: LimboReq, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    _casino_gate(user)
    try:
        target = Decimal(req.target)
    except Exception:
        raise HTTPException(400, "bad target")
    if not AR.LIMBO_MIN <= target <= AR.LIMBO_MAX:
        raise HTTPException(400, f"target is {AR.LIMBO_MIN}-{AR.LIMBO_MAX}")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    out = AR.limbo_play(pair.server_seed, pair.client_seed, nonce, target)
    win = payout_micros(stake_m, target) if out.win else 0

    rnd = CasinoRound(game="limbo", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="settled",
                      outcome="win" if out.win else "lose", payout_micros=win,
                      detail=json.dumps({"target": str(target),
                                         "result": str(out.result)}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "limbo_play", rnd.id,
                                  f"lb:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, win, "limbo_play", rnd.id,
               f"lb:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "target": str(target),
            "result": str(out.result), "win": out.win,
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


# ----------------------------------------------------------------- towers ----
class TowersStart(BaseModel):
    stake: str
    level: str
    idempotency_key: str | None = None


def _towers_public(rnd, st, done: bool) -> dict:
    from . import arcade as AR
    row = len(st["picked"])
    out = {"round_id": rnd.id, "status": rnd.status, "outcome": rnd.outcome,
           "level": st["level"], "row": row, "rows": AR.TOWERS_ROWS,
           "tiles": AR.TOWERS_LEVELS[st["level"]],
           "picked": st["picked"],
           "stake": str(from_micros(rnd.stake_micros)),
           "multiplier": str(AR.towers_mult(st["level"], row)),
           "next_multiplier": (str(AR.towers_mult(st["level"], row + 1))
                               if row < AR.TOWERS_ROWS else None),
           "payout": (str(from_micros(rnd.payout_micros))
                      if rnd.payout_micros is not None else None)}
    if done:
        out["traps"] = st["traps"]
    return out


@router.post("/towers/start")
async def towers_start(req: TowersStart, user: User = Depends(betting_user),
                       session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    _casino_gate(user)
    if await _open_round(session, user.id, "towers"):
        raise HTTPException(409, "finish your open tower first")
    if req.level not in AR.TOWERS_LEVELS:
        raise HTTPException(400, "level is easy, medium or hard")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    traps = AR.towers_traps(pair.server_seed, pair.client_seed, nonce, req.level)
    st = {"level": req.level, "traps": traps, "picked": []}

    rnd = CasinoRound(game="towers", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, "towers_round", rnd.id,
                              f"tw:{rnd.id}:place:{key}")
    out = _towers_public(rnd, st, False)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


class TowersPick(BaseModel):
    tile: int


@router.post("/towers/{round_id}/pick")
async def towers_pick(round_id: int, req: TowersPick,
                      user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "towers":
        raise HTTPException(404, "no such tower")
    if rnd.status != "open":
        raise HTTPException(409, "that tower is finished")
    st = json.loads(rnd.detail)
    tiles = AR.TOWERS_LEVELS[st["level"]]
    if not 0 <= req.tile < tiles:
        raise HTTPException(400, f"tile is 0-{tiles - 1}")
    row = len(st["picked"])

    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    if req.tile == st["traps"][row]:
        st["picked"].append(req.tile)
        rnd.status = "settled"; rnd.outcome = "bust"; rnd.payout_micros = 0
        rnd.settled_at = datetime.now(timezone.utc)
        rnd.detail = json.dumps(st)
    else:
        st["picked"].append(req.tile)
        rnd.detail = json.dumps(st)
        if len(st["picked"]) == AR.TOWERS_ROWS:      # topped out: auto-pay
            mult = AR.towers_mult(st["level"], AR.TOWERS_ROWS)
            rnd.payout_micros = payout_micros(rnd.stake_micros, mult)
            rnd.status = "settled"; rnd.outcome = "topped"
            rnd.settled_at = datetime.now(timezone.utc)
            await _pay(session, house, wallet, rnd.payout_micros,
                       "towers_round", rnd.id, f"tw:{rnd.id}:settle")
    out = _towers_public(rnd, st, rnd.status == "settled")
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.post("/towers/{round_id}/cashout")
async def towers_cashout(round_id: int, user: User = Depends(betting_user),
                         session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "towers":
        raise HTTPException(404, "no such tower")
    if rnd.status != "open":
        raise HTTPException(409, "that tower is finished")
    st = json.loads(rnd.detail)
    if not st["picked"]:
        raise HTTPException(409, "clear at least one row before cashing out")
    mult = AR.towers_mult(st["level"], len(st["picked"]))
    rnd.payout_micros = payout_micros(rnd.stake_micros, mult)
    rnd.status = "settled"; rnd.outcome = "cashout"
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, rnd.payout_micros, "towers_round",
               rnd.id, f"tw:{rnd.id}:settle")
    out = _towers_public(rnd, st, True)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.get("/towers/active")
async def towers_active(user: User = Depends(current_user),
                        session: AsyncSession = Depends(get_session)):
    rnd = await _open_round(session, user.id, "towers")
    await session.commit()
    if rnd is None:
        return {"active": None}
    return {"active": _towers_public(rnd, json.loads(rnd.detail), False)}


# ----------------------------------------------------------- dragon tiger ----
class DTReq(BaseModel):
    stake: str
    bet: str                                  # dragon | tiger | tie
    idempotency_key: str | None = None


@router.post("/dt/deal")
async def dt_deal(req: DTReq, user: User = Depends(betting_user),
                  session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    _casino_gate(user)
    if req.bet not in ("dragon", "tiger", "tie"):
        raise HTTPException(400, "bet is dragon, tiger or tie")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    dragon, tiger = AR.dt_deal(pair.server_seed, pair.client_seed, nonce)
    ret = AR.dt_settle(req.bet, dragon, tiger)
    win = payout_micros(stake_m, ret)
    dr, tr = AR.card_rank(dragon), AR.card_rank(tiger)
    outcome = "tie" if dr == tr else ("dragon" if dr > tr else "tiger")

    rnd = CasinoRound(game="dragontiger", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="settled",
                      outcome="win" if win > stake_m else
                              ("push_half" if win > 0 else "lose"),
                      payout_micros=win,
                      detail=json.dumps({"bet": req.bet, "dragon": dragon,
                                         "tiger": tiger, "result": outcome}))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "dt_deal", rnd.id,
                                  f"dt2:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, win, "dt_deal", rnd.id,
               f"dt2:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "dragon": dragon, "tiger": tiger,
            "result": outcome, "bet": req.bet,
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


# ------------------------------------------------------------------ hi-lo ----
class HiLoStart(BaseModel):
    stake: str
    idempotency_key: str | None = None


def _hilo_public(rnd, st) -> dict:
    from . import arcade as AR
    r = AR.card_rank(st["card"])
    return {"round_id": rnd.id, "status": rnd.status, "outcome": rnd.outcome,
            "card": st["card"], "history": st["history"],
            "stake": str(from_micros(rnd.stake_micros)),
            "multiplier": str(Decimal(st["mult"])),
            "higher_mult": str(AR.hilo_mult(r, "higher")),
            "lower_mult": str(AR.hilo_mult(r, "lower")),
            "payout": (str(from_micros(rnd.payout_micros))
                       if rnd.payout_micros is not None else None)}


@router.post("/hilo/start")
async def hilo_start(req: HiLoStart, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    _casino_gate(user)
    if await _open_round(session, user.id, "hilo"):
        raise HTTPException(409, "finish your open hand first")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    card = AR.hilo_card(pair.server_seed, pair.client_seed, nonce, 0)
    st = {"card": card, "step": 0, "mult": "1", "history": [card]}

    rnd = CasinoRound(game="hilo", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, "hilo_round", rnd.id,
                              f"hl:{rnd.id}:place:{key}")
    out = _hilo_public(rnd, st)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


class HiLoGuess(BaseModel):
    guess: str                                # higher | lower


@router.post("/hilo/{round_id}/guess")
async def hilo_guess(round_id: int, req: HiLoGuess,
                     user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    from . import arcade as AR
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "hilo":
        raise HTTPException(404, "no such hand")
    if rnd.status != "open":
        raise HTTPException(409, "that hand is finished")
    if req.guess not in ("higher", "lower"):
        raise HTTPException(400, "guess is higher or lower")
    st = json.loads(rnd.detail)
    r = AR.card_rank(st["card"])
    step_mult = AR.hilo_mult(r, req.guess)
    if step_mult <= 0:
        raise HTTPException(400, "that call isn't offered on this card")

    pair = await seeds.active_pair(session, user.id)
    nxt = AR.hilo_card(pair.server_seed, pair.client_seed, rnd.nonce,
                       st["step"] + 1)
    nr = AR.card_rank(nxt)
    correct = nr > r if req.guess == "higher" else nr < r
    st["step"] += 1
    st["card"] = nxt
    st["history"].append(nxt)

    if correct:
        st["mult"] = str((Decimal(st["mult"]) * step_mult)
                         .quantize(Decimal("0.0001"), rounding="ROUND_DOWN"))
        rnd.detail = json.dumps(st)
    else:
        rnd.status = "settled"; rnd.outcome = "bust"; rnd.payout_micros = 0
        rnd.settled_at = datetime.now(timezone.utc)
        rnd.detail = json.dumps(st)
    out = _hilo_public(rnd, st)
    out["correct"] = correct
    wallet = await ledger.wallet_for(session, user.id)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.post("/hilo/{round_id}/cashout")
async def hilo_cashout(round_id: int, user: User = Depends(betting_user),
                       session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "hilo":
        raise HTTPException(404, "no such hand")
    if rnd.status != "open":
        raise HTTPException(409, "that hand is finished")
    st = json.loads(rnd.detail)
    if st["step"] == 0:
        raise HTTPException(409, "make at least one call before cashing out")
    rnd.payout_micros = payout_micros(rnd.stake_micros, Decimal(st["mult"]))
    rnd.status = "settled"; rnd.outcome = "cashout"
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, rnd.payout_micros, "hilo_round",
               rnd.id, f"hl:{rnd.id}:settle")
    out = _hilo_public(rnd, st)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.get("/hilo/active")
async def hilo_active(user: User = Depends(current_user),
                      session: AsyncSession = Depends(get_session)):
    rnd = await _open_round(session, user.id, "hilo")
    await session.commit()
    if rnd is None:
        return {"active": None}
    return {"active": _hilo_public(rnd, json.loads(rnd.detail))}


# ------------------------------------------------------------ quick batch ----
class QuickBet(BaseModel):
    stake: str
    bet: str | None = None
    idempotency_key: str | None = None


async def _instant_round(session, user, stake_m: int, game: str, ref: str,
                         ret_mult: Decimal, detail: dict, key: str):
    """Shared settle path for one-shot games: charge, pay, record."""
    win = payout_micros(stake_m, ret_mult)
    rnd = CasinoRound(game=game, user_id=user.id,
                      seed_pair_id=detail.pop("_pair_id"),
                      nonce=detail.pop("_nonce"),
                      stake_micros=stake_m, status="settled",
                      outcome="win" if win > stake_m else
                              ("push" if win > 0 else "lose"),
                      payout_micros=win, detail=json.dumps(detail))
    session.add(rnd)
    await session.flush()
    wallet, house = await _charge(session, user, stake_m, ref, rnd.id,
                                  f"{game}:{rnd.id}:place:{key}")
    await _pay(session, house, wallet, win, ref, rnd.id,
               f"{game}:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    return rnd, win, balance


@router.post("/lucky7/roll")
async def lucky7_roll(req: QuickBet, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    from . import quick as Q
    _casino_gate(user)
    if req.bet not in ("under", "seven", "over"):
        raise HTTPException(400, "bet is under, seven or over")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    d1, d2 = Q.lucky7_roll(pair.server_seed, pair.client_seed, nonce)
    ret = Q.lucky7_settle(req.bet, d1 + d2)
    rnd, win, balance = await _instant_round(
        session, user, stake_m, "lucky7", "lucky7_roll", ret,
        {"bet": req.bet, "dice": [d1, d2], "_pair_id": pair.id, "_nonce": nonce},
        req.idempotency_key or secrets.token_hex(8))
    await session.commit()
    return {"round_id": rnd.id, "dice": [d1, d2], "total": d1 + d2,
            "bet": req.bet, "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


@router.post("/rps/throw")
async def rps_throw(req: QuickBet, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    from . import quick as Q
    _casino_gate(user)
    if req.bet not in Q.RPS_MOVES:
        raise HTTPException(400, "bet is rock, paper or scissors")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    house_move = Q.rps_house(pair.server_seed, pair.client_seed, nonce)
    ret = Q.rps_settle(req.bet, house_move)
    rnd, win, balance = await _instant_round(
        session, user, stake_m, "rps", "rps_throw", ret,
        {"player": req.bet, "house": house_move,
         "_pair_id": pair.id, "_nonce": nonce},
        req.idempotency_key or secrets.token_hex(8))
    await session.commit()
    return {"round_id": rnd.id, "player": req.bet, "house": house_move,
            "result": "push" if ret == 1 else ("win" if ret > 1 else "lose"),
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


@router.post("/darts/throw")
async def darts_throw(req: QuickBet, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    from . import quick as Q
    _casino_gate(user)
    rings = [r for r, _ in Q.DARTS_RINGS]
    if req.bet not in rings:
        raise HTTPException(400, f"bet is one of {', '.join(rings)}")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    landed = Q.darts_throw(pair.server_seed, pair.client_seed, nonce)
    ret = Q.darts_mult(req.bet) if landed == req.bet else Decimal(0)
    rnd, win, balance = await _instant_round(
        session, user, stake_m, "darts", "darts_throw", ret,
        {"bet": req.bet, "landed": landed,
         "_pair_id": pair.id, "_nonce": nonce},
        req.idempotency_key or secrets.token_hex(8))
    await session.commit()
    return {"round_id": rnd.id, "bet": req.bet, "landed": landed,
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


@router.post("/prism/spin")
async def prism_spin(req: QuickBet, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    from . import quick as Q
    _casino_gate(user)
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    gem, mult = Q.prism_spin(pair.server_seed, pair.client_seed, nonce)
    rnd, win, balance = await _instant_round(
        session, user, stake_m, "prism", "prism_spin", mult,
        {"gem": gem, "multiplier": str(mult),
         "_pair_id": pair.id, "_nonce": nonce},
        req.idempotency_key or secrets.token_hex(8))
    await session.commit()
    return {"round_id": rnd.id, "gem": gem, "multiplier": str(mult),
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


# ---------------------------------------------------------- streak ladders ----
class LadderStart(BaseModel):
    stake: str
    level: str = "normal"
    idempotency_key: str | None = None


def _ladder_public(rnd, st, done: bool = False) -> dict:
    from . import quick as Q
    g, lvl, step = st["game"], st["level"], st["step"]
    mx = Q.LADDERS[g]["max_steps"][lvl]
    return {"round_id": rnd.id, "status": rnd.status, "outcome": rnd.outcome,
            "game": g, "level": lvl, "step": step, "max_steps": mx,
            "stake": str(from_micros(rnd.stake_micros)),
            "multiplier": str(Q.ladder_mult(g, lvl, step)),
            "next_multiplier": (str(Q.ladder_mult(g, lvl, step + 1))
                                if step < mx else None),
            "payout": (str(from_micros(rnd.payout_micros))
                       if rnd.payout_micros is not None else None)}


@router.post("/ladder/{game}/start")
async def ladder_start(game: str, req: LadderStart,
                       user: User = Depends(betting_user),
                       session: AsyncSession = Depends(get_session)):
    from . import quick as Q
    _casino_gate(user)
    if game not in Q.LADDERS:
        raise HTTPException(404, "no such game")
    if req.level not in Q.LADDERS[game]["levels"]:
        raise HTTPException(400, f"level is {', '.join(Q.LADDERS[game]['levels'])}")
    if await _open_round(session, user.id, f"ladder:{game}"):
        raise HTTPException(409, "finish your open run first")
    stake_m = _stake_or_400(req.stake, user)

    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    st = {"game": game, "level": req.level, "step": 0}
    rnd = CasinoRound(game=f"ladder:{game}", user_id=user.id,
                      seed_pair_id=pair.id, nonce=nonce, stake_micros=stake_m,
                      status="open", detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, f"{game}_run", rnd.id,
                              f"ld:{rnd.id}:place:{key}")
    out = _ladder_public(rnd, st)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.post("/ladder/{game}/{round_id}/step")
async def ladder_step(game: str, round_id: int,
                      user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    from . import quick as Q
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != f"ladder:{game}":
        raise HTTPException(404, "no such run")
    if rnd.status != "open":
        raise HTTPException(409, "that run is finished")
    st = json.loads(rnd.detail)
    lvl, step = st["level"], st["step"]
    mx = Q.LADDERS[game]["max_steps"][lvl]
    if step >= mx:
        raise HTTPException(409, "top of the ladder — cash out")

    pair = await seeds.active_pair(session, user.id)
    ok = Q.ladder_step(pair.server_seed, pair.client_seed, rnd.nonce,
                       game, lvl, step)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    if ok:
        st["step"] += 1
        rnd.detail = json.dumps(st)
        if st["step"] >= mx:                      # top: auto-collect
            mult = Q.ladder_mult(game, lvl, mx)
            rnd.payout_micros = payout_micros(rnd.stake_micros, mult)
            rnd.status = "settled"; rnd.outcome = "topped"
            rnd.settled_at = datetime.now(timezone.utc)
            await _pay(session, house, wallet, rnd.payout_micros,
                       f"{game}_run", rnd.id, f"ld:{rnd.id}:settle")
    else:
        rnd.status = "settled"; rnd.outcome = "bust"; rnd.payout_micros = 0
        rnd.settled_at = datetime.now(timezone.utc)
        rnd.detail = json.dumps(st)
    out = _ladder_public(rnd, st, rnd.status == "settled")
    out["survived"] = ok
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.post("/ladder/{game}/{round_id}/cashout")
async def ladder_cashout(game: str, round_id: int,
                         user: User = Depends(betting_user),
                         session: AsyncSession = Depends(get_session)):
    from . import quick as Q
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != f"ladder:{game}":
        raise HTTPException(404, "no such run")
    if rnd.status != "open":
        raise HTTPException(409, "that run is finished")
    st = json.loads(rnd.detail)
    if st["step"] == 0:
        raise HTTPException(409, "take at least one step before cashing out")
    mult = Q.ladder_mult(game, st["level"], st["step"])
    rnd.payout_micros = payout_micros(rnd.stake_micros, mult)
    rnd.status = "settled"; rnd.outcome = "cashout"
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, rnd.payout_micros, f"{game}_run",
               rnd.id, f"ld:{rnd.id}:settle")
    out = _ladder_public(rnd, st, True)
    out["balance"] = str(from_micros(await ledger.balance_of(session, wallet.id)))
    await session.commit()
    return out


@router.get("/ladder/{game}/active")
async def ladder_active(game: str, user: User = Depends(current_user),
                        session: AsyncSession = Depends(get_session)):
    rnd = await _open_round(session, user.id, f"ladder:{game}")
    await session.commit()
    if rnd is None:
        return {"active": None}
    return {"active": _ladder_public(rnd, json.loads(rnd.detail))}


# ------------------------------------------------------------- acey ducey ----
@router.post("/acey/start")
async def acey_start(req: HoldSpinReq, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    _casino_gate(user)
    if await _open_round(session, user.id, "acey"):
        raise HTTPException(409, "finish your open hand first")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    a = CD.draw_card(pair.server_seed, pair.client_seed, nonce, 0)
    b = CD.draw_card(pair.server_seed, pair.client_seed, nonce, 1)
    pb, po = CD.acey_probs(CD.rank(a), CD.rank(b))
    st = {"cards": [a, b]}
    rnd = CasinoRound(game="acey", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, "acey_hand", rnd.id,
                              f"ac:{rnd.id}:place:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "cards": [a, b],
            "between_mult": str(CD.acey_mult(pb)),
            "outside_mult": str(CD.acey_mult(po)),
            "stake": str(from_micros(stake_m)),
            "balance": str(from_micros(balance))}


class AceyChoose(BaseModel):
    side: str                                  # between | outside


@router.post("/acey/{round_id}/choose")
async def acey_choose(round_id: int, req: AceyChoose,
                      user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "acey":
        raise HTTPException(404, "no such hand")
    if rnd.status != "open":
        raise HTTPException(409, "that hand is finished")
    if req.side not in ("between", "outside"):
        raise HTTPException(400, "side is between or outside")
    st = json.loads(rnd.detail)
    a, b = st["cards"]
    pb, po = CD.acey_probs(CD.rank(a), CD.rank(b))
    p = pb if req.side == "between" else po
    mult = CD.acey_mult(p)
    if mult <= 0:
        raise HTTPException(400, "that side isn't offered on these cards")

    pair = await seeds.active_pair(session, user.id)
    third = CD.draw_card(pair.server_seed, pair.client_seed, rnd.nonce, 2)
    lo, hi = sorted((CD.rank(a), CD.rank(b)))
    nr = CD.rank(third)
    hit = (lo < nr < hi) if req.side == "between" else (nr < lo or nr > hi)
    win = payout_micros(rnd.stake_micros, mult) if hit else 0
    st["third"] = third; st["side"] = req.side
    rnd.status = "settled"; rnd.outcome = "win" if hit else "lose"
    rnd.payout_micros = win
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, win, "acey_hand", rnd.id,
               f"ac:{rnd.id}:settle")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "cards": [a, b], "third": third,
            "side": req.side, "hit": hit, "multiplier": str(mult),
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


@router.get("/acey/active")
async def acey_active(user: User = Depends(current_user),
                      session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await _open_round(session, user.id, "acey")
    await session.commit()
    if rnd is None:
        return {"active": None}
    st = json.loads(rnd.detail)
    a, b = st["cards"]
    pb, po = CD.acey_probs(CD.rank(a), CD.rank(b))
    return {"active": {"round_id": rnd.id, "cards": st["cards"],
                       "between_mult": str(CD.acey_mult(pb)),
                       "outside_mult": str(CD.acey_mult(po)),
                       "stake": str(from_micros(rnd.stake_micros))}}


# ------------------------------------------------------------- casino war ----
@router.post("/war/deal")
async def war_deal(req: HoldSpinReq, user: User = Depends(betting_user),
                   session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    _casino_gate(user)
    if await _open_round(session, user.id, "war"):
        raise HTTPException(409, "finish your open battle first")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    p = CD.draw_card(pair.server_seed, pair.client_seed, nonce, 0)
    d = CD.draw_card(pair.server_seed, pair.client_seed, nonce, 1)
    pr, dr = CD.rank(p), CD.rank(d)
    tie = pr == dr
    st = {"player": p, "dealer": d, "stage": "war_offer" if tie else "done"}

    if tie:
        rnd = CasinoRound(game="war", user_id=user.id, seed_pair_id=pair.id,
                          nonce=nonce, stake_micros=stake_m, status="open",
                          detail=json.dumps(st))
    else:
        win = payout_micros(stake_m, Decimal(2)) if pr > dr else 0
        rnd = CasinoRound(game="war", user_id=user.id, seed_pair_id=pair.id,
                          nonce=nonce, stake_micros=stake_m, status="settled",
                          outcome="win" if win else "lose", payout_micros=win,
                          detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, house = await _charge(session, user, stake_m, "war_hand", rnd.id,
                                  f"wr:{rnd.id}:place:{key}")
    if rnd.status == "settled":
        await _pay(session, house, wallet, rnd.payout_micros, "war_hand",
                   rnd.id, f"wr:{rnd.id}:settle:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "player": p, "dealer": d, "tie": tie,
            "status": rnd.status,
            "payout": str(from_micros(rnd.payout_micros or 0)),
            "balance": str(from_micros(balance))}


@router.post("/war/{round_id}/war")
async def war_go(round_id: int, user: User = Depends(betting_user),
                 session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "war":
        raise HTTPException(404, "no such battle")
    if rnd.status != "open":
        raise HTTPException(409, "that battle is finished")
    st = json.loads(rnd.detail)

    pair = await seeds.active_pair(session, user.id)
    wallet, house = await _charge(session, user, rnd.stake_micros, "war_hand",
                                  rnd.id, f"wr:{rnd.id}:raise")
    p2 = CD.draw_card(pair.server_seed, pair.client_seed, rnd.nonce, 2)
    d2 = CD.draw_card(pair.server_seed, pair.client_seed, rnd.nonce, 3)
    pr, dr = CD.rank(p2), CD.rank(d2)
    # 3x back of the 2 staked on a win, 4x on a second tie, 0 on a loss
    ret = Decimal(4) if pr == dr else (Decimal(3) if pr > dr else Decimal(0))
    win = payout_micros(rnd.stake_micros, ret)
    st.update({"war_player": p2, "war_dealer": d2, "stage": "done"})
    rnd.status = "settled"
    rnd.outcome = "war_win" if ret >= 3 else "war_lose"
    rnd.payout_micros = win
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    await _pay(session, house, wallet, win, "war_hand", rnd.id,
               f"wr:{rnd.id}:war_settle")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "war_player": p2, "war_dealer": d2,
            "outcome": rnd.outcome, "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


@router.post("/war/{round_id}/surrender")
async def war_surrender(round_id: int, user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "war":
        raise HTTPException(404, "no such battle")
    if rnd.status != "open":
        raise HTTPException(409, "that battle is finished")
    st = json.loads(rnd.detail)
    win = payout_micros(rnd.stake_micros, CD.WAR_SURRENDER)
    st["stage"] = "done"
    rnd.status = "settled"; rnd.outcome = "surrender"; rnd.payout_micros = win
    rnd.settled_at = datetime.now(timezone.utc)
    rnd.detail = json.dumps(st)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, win, "war_hand", rnd.id,
               f"wr:{rnd.id}:surrender")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "outcome": "surrender",
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


@router.get("/war/active")
async def war_active(user: User = Depends(current_user),
                     session: AsyncSession = Depends(get_session)):
    rnd = await _open_round(session, user.id, "war")
    await session.commit()
    if rnd is None:
        return {"active": None}
    st = json.loads(rnd.detail)
    return {"active": {"round_id": rnd.id, "player": st["player"],
                       "dealer": st["dealer"],
                       "stake": str(from_micros(rnd.stake_micros))}}


# ------------------------------------------------------------ 10 card flip ----
@router.post("/flip/start")
async def flip_start(req: HoldSpinReq, user: User = Depends(betting_user),
                     session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    _casino_gate(user)
    if await _open_round(session, user.id, "flip"):
        raise HTTPException(409, "finish your open run first")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    deck = CD.flip_deck(pair.server_seed, pair.client_seed, nonce)
    st = {"deck": deck, "flipped": 0, "mult": "1"}
    rnd = CasinoRound(game="flip", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, "flip_run", rnd.id,
                              f"fl:{rnd.id}:place:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "flipped": [], "reds_left": CD.FLIP_REDS,
            "blacks_left": CD.FLIP_BLACKS, "multiplier": "1",
            "next_multiplier": str(CD.flip_step_mult(5, 5)),
            "stake": str(from_micros(stake_m)),
            "balance": str(from_micros(balance))}


def _flip_state(st) -> tuple[list[str], int, int]:
    seen = st["deck"][:st["flipped"]]
    reds = CD_FLIP_REDS - seen.count("r")
    blacks = CD_FLIP_BLACKS - seen.count("b")
    return seen, reds, blacks


CD_FLIP_REDS, CD_FLIP_BLACKS = 5, 5


@router.post("/flip/{round_id}/flip")
async def flip_flip(round_id: int, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "flip":
        raise HTTPException(404, "no such run")
    if rnd.status != "open":
        raise HTTPException(409, "that run is finished")
    st = json.loads(rnd.detail)
    _, reds, blacks = _flip_state(st)
    if reds <= 0:
        raise HTTPException(409, "no red cards left — cash out")
    step_mult = CD.flip_step_mult(reds, blacks)
    card = st["deck"][st["flipped"]]
    st["flipped"] += 1
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    if card == "r":
        st["mult"] = str((Decimal(st["mult"]) * step_mult)
                         .quantize(Decimal("0.0001"), rounding="ROUND_DOWN"))
        rnd.detail = json.dumps(st)
        _, reds2, _b2 = _flip_state(st)
        if reds2 == 0:                          # all reds found: auto-collect
            rnd.payout_micros = payout_micros(rnd.stake_micros,
                                              Decimal(st["mult"]))
            rnd.status = "settled"; rnd.outcome = "cleared"
            rnd.settled_at = datetime.now(timezone.utc)
            await _pay(session, house, wallet, rnd.payout_micros, "flip_run",
                       rnd.id, f"fl:{rnd.id}:settle")
    else:
        rnd.status = "settled"; rnd.outcome = "bust"; rnd.payout_micros = 0
        rnd.settled_at = datetime.now(timezone.utc)
        rnd.detail = json.dumps(st)
    seen, reds, blacks = _flip_state(st)
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "card": card, "flipped": seen,
            "reds_left": reds, "blacks_left": blacks,
            "status": rnd.status, "outcome": rnd.outcome,
            "multiplier": st["mult"],
            "next_multiplier": (str(CD.flip_step_mult(reds, blacks))
                                if rnd.status == "open" else None),
            "payout": (str(from_micros(rnd.payout_micros))
                       if rnd.payout_micros is not None else None),
            "balance": str(from_micros(balance))}


@router.post("/flip/{round_id}/cashout")
async def flip_cashout(round_id: int, user: User = Depends(betting_user),
                       session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "flip":
        raise HTTPException(404, "no such run")
    if rnd.status != "open":
        raise HTTPException(409, "that run is finished")
    st = json.loads(rnd.detail)
    if st["flipped"] == 0:
        raise HTTPException(409, "flip at least one card before cashing out")
    rnd.payout_micros = payout_micros(rnd.stake_micros, Decimal(st["mult"]))
    rnd.status = "settled"; rnd.outcome = "cashout"
    rnd.settled_at = datetime.now(timezone.utc)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, rnd.payout_micros, "flip_run", rnd.id,
               f"fl:{rnd.id}:settle")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "status": "settled", "outcome": "cashout",
            "multiplier": st["mult"],
            "payout": str(from_micros(rnd.payout_micros)),
            "balance": str(from_micros(balance))}


@router.get("/flip/active")
async def flip_active(user: User = Depends(current_user),
                      session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await _open_round(session, user.id, "flip")
    await session.commit()
    if rnd is None:
        return {"active": None}
    st = json.loads(rnd.detail)
    seen, reds, blacks = _flip_state(st)
    return {"active": {"round_id": rnd.id, "flipped": seen,
                       "reds_left": reds, "blacks_left": blacks,
                       "multiplier": st["mult"],
                       "next_multiplier": str(CD.flip_step_mult(reds, blacks)),
                       "stake": str(from_micros(rnd.stake_micros))}}


# ------------------------------------------------------------ ride the bus ----
@router.post("/bus/start")
async def bus_start(req: HoldSpinReq, user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    _casino_gate(user)
    if await _open_round(session, user.id, "bus"):
        raise HTTPException(409, "finish your open ride first")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    st = {"cards": [], "stage": 0, "mult": "1"}
    rnd = CasinoRound(game="bus", user_id=user.id, seed_pair_id=pair.id,
                      nonce=nonce, stake_micros=stake_m, status="open",
                      detail=json.dumps(st))
    session.add(rnd)
    await session.flush()
    key = req.idempotency_key or secrets.token_hex(8)
    wallet, _ = await _charge(session, user, stake_m, "bus_ride", rnd.id,
                              f"bs:{rnd.id}:place:{key}")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "cards": [], "stage": CD.BUS_STAGES[0],
            "stage_num": 0, "multiplier": "1",
            "options": {k: str(v) for k, v in
                        CD.bus_options(CD.BUS_STAGES[0], []).items()},
            "stake": str(from_micros(stake_m)),
            "balance": str(from_micros(balance))}


class BusGuess(BaseModel):
    choice: str


@router.post("/bus/{round_id}/guess")
async def bus_guess(round_id: int, req: BusGuess,
                    user: User = Depends(betting_user),
                    session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "bus":
        raise HTTPException(404, "no such ride")
    if rnd.status != "open":
        raise HTTPException(409, "that ride is finished")
    st = json.loads(rnd.detail)
    stage = CD.BUS_STAGES[st["stage"]]
    opts = CD.bus_options(stage, st["cards"])
    if req.choice not in opts:
        raise HTTPException(400, f"choice is one of {', '.join(opts)}")

    pair = await seeds.active_pair(session, user.id)
    new = CD.draw_card(pair.server_seed, pair.client_seed, rnd.nonce,
                       st["stage"])
    correct = CD.bus_correct(stage, req.choice, st["cards"], new)
    st["cards"].append(new)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    if correct:
        st["mult"] = str((Decimal(st["mult"]) * opts[req.choice])
                         .quantize(Decimal("0.0001"), rounding="ROUND_DOWN"))
        st["stage"] += 1
        rnd.detail = json.dumps(st)
        if st["stage"] >= len(CD.BUS_STAGES):    # off the bus: auto-collect
            rnd.payout_micros = payout_micros(rnd.stake_micros,
                                              Decimal(st["mult"]))
            rnd.status = "settled"; rnd.outcome = "rode_the_bus"
            rnd.settled_at = datetime.now(timezone.utc)
            await _pay(session, house, wallet, rnd.payout_micros, "bus_ride",
                       rnd.id, f"bs:{rnd.id}:settle")
    else:
        rnd.status = "settled"; rnd.outcome = "bust"; rnd.payout_micros = 0
        rnd.settled_at = datetime.now(timezone.utc)
        rnd.detail = json.dumps(st)
    nxt = (CD.BUS_STAGES[st["stage"]]
           if rnd.status == "open" else None)
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "card": new, "correct": correct,
            "cards": st["cards"], "status": rnd.status,
            "outcome": rnd.outcome, "multiplier": st["mult"],
            "stage": nxt, "stage_num": st["stage"],
            "options": ({k: str(v) for k, v in
                         CD.bus_options(nxt, st["cards"]).items()}
                        if nxt else None),
            "payout": (str(from_micros(rnd.payout_micros))
                       if rnd.payout_micros is not None else None),
            "balance": str(from_micros(balance))}


@router.post("/bus/{round_id}/cashout")
async def bus_cashout(round_id: int, user: User = Depends(betting_user),
                      session: AsyncSession = Depends(get_session)):
    rnd = await session.get(CasinoRound, round_id)
    if rnd is None or rnd.user_id != user.id or rnd.game != "bus":
        raise HTTPException(404, "no such ride")
    if rnd.status != "open":
        raise HTTPException(409, "that ride is finished")
    st = json.loads(rnd.detail)
    if st["stage"] == 0:
        raise HTTPException(409, "clear a stage before cashing out")
    rnd.payout_micros = payout_micros(rnd.stake_micros, Decimal(st["mult"]))
    rnd.status = "settled"; rnd.outcome = "cashout"
    rnd.settled_at = datetime.now(timezone.utc)
    wallet = await ledger.wallet_for(session, user.id)
    house = await ledger.house_account(session)
    await _pay(session, house, wallet, rnd.payout_micros, "bus_ride", rnd.id,
               f"bs:{rnd.id}:settle")
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return {"round_id": rnd.id, "status": "settled", "outcome": "cashout",
            "multiplier": st["mult"],
            "payout": str(from_micros(rnd.payout_micros)),
            "balance": str(from_micros(balance))}


@router.get("/bus/active")
async def bus_active(user: User = Depends(current_user),
                     session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    rnd = await _open_round(session, user.id, "bus")
    await session.commit()
    if rnd is None:
        return {"active": None}
    st = json.loads(rnd.detail)
    stage = CD.BUS_STAGES[st["stage"]]
    return {"active": {"round_id": rnd.id, "cards": st["cards"],
                       "stage": stage, "stage_num": st["stage"],
                       "multiplier": st["mult"],
                       "options": {k: str(v) for k, v in
                                   CD.bus_options(stage, st["cards"]).items()},
                       "stake": str(from_micros(rnd.stake_micros))}}


# -------------------------------------------------------------- suit link ----
@router.post("/suitlink/play")
async def suitlink_play(req: QuickBet, user: User = Depends(betting_user),
                        session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    _casino_gate(user)
    if req.bet not in ("s", "h", "d", "c"):
        raise HTTPException(400, "bet is s, h, d or c")
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    a = CD.draw_card(pair.server_seed, pair.client_seed, nonce, 0)
    b = CD.draw_card(pair.server_seed, pair.client_seed, nonce, 1)
    ret = CD.suitlink_settle(req.bet, a, b)
    rnd, win, balance = await _instant_round(
        session, user, stake_m, "suitlink", "suitlink_play", ret,
        {"suit": req.bet, "cards": [a, b],
         "_pair_id": pair.id, "_nonce": nonce},
        req.idempotency_key or secrets.token_hex(8))
    await session.commit()
    return {"round_id": rnd.id, "suit": req.bet, "cards": [a, b],
            "hits": (a[1] == req.bet) + (b[1] == req.bet),
            "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


# --------------------------------------------------------- high card flush ----
@router.post("/hcf/deal")
async def hcf_deal(req: QuickBet, user: User = Depends(betting_user),
                   session: AsyncSession = Depends(get_session)):
    from . import cards as CD
    _casino_gate(user)
    stake_m = _stake_or_400(req.stake, user)
    pair = await seeds.active_pair(session, user.id)
    nonce = await seeds.consume_nonce(session, pair)
    hand = CD.hcf_deal(pair.server_seed, pair.client_seed, nonce)
    k = CD.hcf_flush_len(hand)
    mult = CD.hcf_paytable().get(k, Decimal(0))
    rnd, win, balance = await _instant_round(
        session, user, stake_m, "hcf", "hcf_deal", mult,
        {"hand": hand, "flush_len": k,
         "_pair_id": pair.id, "_nonce": nonce},
        req.idempotency_key or secrets.token_hex(8))
    await session.commit()
    return {"round_id": rnd.id, "hand": hand, "flush_len": k,
            "multiplier": str(mult), "payout": str(from_micros(win)),
            "balance": str(from_micros(balance))}


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
