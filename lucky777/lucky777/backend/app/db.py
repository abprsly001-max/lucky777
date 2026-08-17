from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import Base
from .sportsbook import models as _sb_models  # noqa: F401  (register tables)

engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


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


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
