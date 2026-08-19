import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .casino.duel.router import router as duel_router
from .casino.games.router import router as casino_router
from .db import init_db
from .routers.agent import router as agent_router
from .routers.auth import router as auth_router
from .routers.fairness import router as fairness_router
from .routers.house import router as house_router
from .racebook.router import router as racebook_router
from .routers.player import router as player_router
from .routers.wallet import router as wallet_router
from .sportsbook.router import router as sportsbook_router


async def _live_ticker():
    """Background clock for the live engine: every few seconds the live games
    advance, reprice, and -- at full time -- grade and settle themselves."""
    from .config import settings
    from .db import SessionLocal
    from .sportsbook import live

    log = logging.getLogger("lucky777.live")
    real_feed = settings.odds_provider == "the_odds_api" and settings.odds_api_key
    poll = max(30, settings.live_scores_poll_seconds)
    finals_every = max(poll, settings.finals_sweep_seconds)
    board_every = settings.board_sync_minutes * 60
    featured_every = max(300, settings.featured_sync_minutes * 60)
    since_scores = poll                       # poll immediately on boot
    since_finals = finals_every
    since_board = board_every                 # full sync right after boot
    since_featured = 0
    since_live_odds = 0
    since_props = settings.props_sync_hours * 3600   # pull soon after boot
    since_esports = 1800                      # stock the circuit on boot
    while True:
        await asyncio.sleep(settings.live_tick_seconds)
        try:
            async with SessionLocal() as session:
                if real_feed:
                    # real games: scores come from the feed, never the simulator
                    since_scores += settings.live_tick_seconds
                    since_finals += settings.live_tick_seconds
                    since_board += settings.live_tick_seconds
                    r = {}
                    if since_scores >= poll:
                        since_scores = 0
                        from .sportsbook import ingest
                        finals = since_finals >= finals_every
                        if finals:
                            since_finals = 0
                        r = await ingest.sync_scores(session, include_finals=finals)
                    if settings.live_odds_poll_seconds:
                        since_live_odds += settings.live_tick_seconds
                        if since_live_odds >= settings.live_odds_poll_seconds:
                            since_live_odds = 0
                            from .sportsbook import ingest
                            lo = await ingest.sync_live_odds(session)
                            if lo.get("live_repriced"):
                                log.info("in-play odds from the feed: %s", lo)
                    if settings.props_sync_hours:
                        since_props += settings.live_tick_seconds
                        if since_props >= settings.props_sync_hours * 3600:
                            since_props = 0
                            from .sportsbook import ingest
                            pr = await ingest.sync_props(session)
                            if pr.get("pulled_events"):
                                log.info("props auto-stocked: %s", pr)
                    if settings.esports_enabled:
                        # the house circuit runs itself, feed or no feed
                        from .sportsbook import esports
                        since_esports += settings.live_tick_seconds
                        if since_esports >= 1800:
                            since_esports = 0
                            await esports.ensure_schedule(session)
                        await esports.kickoff_due(session)
                        await live.tick(session, synthetic_only=True)
                    if board_every and since_board >= board_every:
                        since_board = 0
                        since_featured = 0
                        from .sportsbook import ingest
                        b = await ingest.sync(session)
                        log.info("board re-synced from %s: %s events",
                                 b.get("provider"), b.get("events"))
                    else:
                        since_featured += settings.live_tick_seconds
                        if since_featured >= featured_every:
                            since_featured = 0
                            from .sportsbook import ingest
                            b = await ingest.sync(
                                session, sport_keys=ingest.FEATURED_SPORTS)
                            log.info("majors re-synced: %s events", b.get("events"))
                else:
                    if settings.esports_enabled:
                        from .sportsbook import esports
                        since_esports += settings.live_tick_seconds
                        if since_esports >= 1800:
                            since_esports = 0
                            await esports.ensure_schedule(session)
                        await esports.kickoff_due(session)
                    r = await live.tick(session)
                from .racebook.router import tick as rb_tick
                rb = await rb_tick(session)
                nonlocal_props = getattr(_live_ticker, "_since_props", 0) + settings.live_tick_seconds
                if nonlocal_props >= 300:
                    nonlocal_props = 0
                    from .sportsbook.props import auto_grade_props
                    pg = await auto_grade_props(session)
                    if pg.get("graded") or pg.get("voided"):
                        log.info("props auto-graded: %s", pg)
                _live_ticker._since_props = nonlocal_props
                await session.commit()
                if r.get("live") or r.get("ended") or r.get("updated") \
                        or r.get("graded") or rb["races_off"]:
                    log.info("live tick: %s · races: %s", r, rb)
        except Exception:                                    # noqa: BLE001
            log.exception("live tick failed; engine keeps running")


async def _bootstrap():
    """First-boot setup driven by env vars, for hosts with no shell access.

    Idempotent: an existing master or a stocked board is left alone. With the
    env vars unset this does nothing -- a fresh local DB stays genuinely empty.
    """
    from sqlalchemy import func, select

    from .config import settings
    from .core import ledger, seeds
    from .core.security import hash_password
    from .db import SessionLocal
    from .models import User
    from .sportsbook import ingest
    from .sportsbook.models import Event

    log = logging.getLogger("lucky777.boot")
    if settings.jwt_secret == "dev-secret-change-me":
        log.warning("LUCKY777_JWT_SECRET is the dev default — set a real one "
                    "before exposing this to the internet.")

    async with SessionLocal() as session:
        if settings.admin_username and settings.admin_password:
            existing = (await session.execute(select(User).where(
                User.username == settings.admin_username))).scalar_one_or_none()
            if existing is None and len(settings.admin_password) >= 6:
                user = User(username=settings.admin_username,
                            password_hash=hash_password(settings.admin_password),
                            is_admin=1, is_master=1)
                session.add(user)
                await session.flush()
                await ledger.wallet_for(session, user.id)
                await seeds.active_pair(session, user.id)
                log.info("master agent '%s' created from env", settings.admin_username)

        if settings.autoload_feed:
            n = (await session.execute(
                select(func.count()).select_from(Event))).scalar() or 0
            if n == 0:
                report = await ingest.sync(session)
                log.info("board stocked: %s events from the %s feed",
                         report["events"], report["provider"])
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _bootstrap()
    from .config import settings
    task = asyncio.create_task(_live_ticker()) if settings.live_autotick else None
    yield
    if task:
        task.cancel()



app = FastAPI(title="Lucky777", version="0.1.0", lifespan=lifespan)

# a thousand-game board is ~1MB of JSON; on the wire it's ~100KB gzipped
from fastapi.middleware.gzip import GZipMiddleware  # noqa: E402
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(wallet_router)
app.include_router(fairness_router)
app.include_router(duel_router)
app.include_router(casino_router)
app.include_router(house_router)
app.include_router(player_router)
app.include_router(racebook_router)
app.include_router(agent_router)
app.include_router(sportsbook_router)


@app.get("/api/health")
async def health():
    return {"ok": True, "build": "2026-08-19-esports-turbo"}


# serve the built frontend if it exists (single-command production mode)
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = _dist / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
