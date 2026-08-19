from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import Base
from .sportsbook import models as _sb_models  # noqa: F401  (register tables)

engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

if settings.database_url.startswith("sqlite"):
    # per-connection pragmas: never let a reader error out because the feed
    # sync is mid-write, and stop fsyncing on every statement
    from sqlalchemy import event as _sa_event

    @_sa_event.listens_for(engine.sync_engine, "connect")
    def _sqlite_tune(dbapi_conn, _record):          # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA busy_timeout=5000")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()


async def init_db() -> None:
    """Create tables. Nothing else -- no accounts, no data.

    A fresh database stays empty until someone runs `python -m app.cli`. That
    means there is no shipped password to forget about.
    """
    async with engine.begin() as conn:
        if settings.database_url.startswith("sqlite"):
            # concurrency + integrity for the single-file dev database
            await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
            await conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        await conn.run_sync(Base.metadata.create_all)
        # the board's hot paths -- safe to re-run, cheap to keep
        for ddl in (
            "CREATE INDEX IF NOT EXISTS ix_markets_event_status ON markets (event_id, status)",
            "CREATE INDEX IF NOT EXISTS ix_selections_market ON selections (market_id)",
            "CREATE INDEX IF NOT EXISTS ix_events_status_starts ON events (status, starts_at)",
            "CREATE INDEX IF NOT EXISTS ix_bets_status ON bets (status)",
        ):
            try:
                await conn.exec_driver_sql(ddl)
            except Exception:                        # noqa: BLE001
                pass                                 # table name drift: skip


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
