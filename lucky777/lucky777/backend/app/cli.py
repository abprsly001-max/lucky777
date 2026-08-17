"""Bootstrap commands. Nothing is created automatically.

    python -m app.cli create-admin <username>   # prompts for a password
    python -m app.cli load-feed                 # pull the sportsbook feed
    python -m app.cli integrity                 # audit the ledger
    python -m app.cli list-users

A fresh database is genuinely empty: no default account, no fake events. That
means no shipped credentials to forget about, which matters the moment this is
reachable from anywhere other than localhost.
"""
import asyncio
import getpass
import sys

from sqlalchemy import select

from .core import ledger, seeds
from .core.security import hash_password
from .db import SessionLocal, init_db
from .models import User


async def create_admin(username: str, password: str | None = None) -> None:
    await init_db()
    async with SessionLocal() as session:
        existing = (await session.execute(
            select(User).where(User.username == username))).scalar_one_or_none()
        if existing:
            existing.is_admin = 1
            existing.is_master = 1
            await session.commit()
            print(f"'{username}' already existed — promoted to master agent.")
            return

        if password is None:
            password = getpass.getpass("password: ")
            if password != getpass.getpass("confirm: "):
                sys.exit("passwords did not match")
        if len(password) < 6:
            sys.exit("password must be at least 6 characters")

        user = User(username=username, password_hash=hash_password(password),
                    is_admin=1, is_master=1)
        session.add(user)
        await session.flush()
        await ledger.wallet_for(session, user.id)
        await seeds.active_pair(session, user.id)
        await session.commit()
        print(f"master agent '{username}' created.")


async def load_feed() -> None:
    await init_db()
    from .sportsbook import ingest
    async with SessionLocal() as session:
        report = await ingest.sync(session)
        print(f"loaded {report['events']} events from the {report['provider']} feed.")


async def integrity() -> None:
    await init_db()
    async with SessionLocal() as session:
        report = await ledger.check_integrity(session)
        for k, v in report.items():
            print(f"  {k}: {v}")
        sys.exit(0 if report["ok"] else 1)


async def list_users() -> None:
    await init_db()
    async with SessionLocal() as session:
        users = (await session.execute(select(User).order_by(User.id))).scalars().all()
        if not users:
            print("no users yet — run: python -m app.cli create-admin <username>")
            return
        for u in users:
            wallet = await ledger.wallet_for(session, u.id)
            bal = await ledger.balance_of(session, wallet.id)
            role = ("master" if u.is_master else "agent") if u.is_admin else "customer"
            print(f"  {u.id:>3}  {u.username:<20} {role:<9} {bal / 1_000_000:>12,.2f}")
        await session.commit()


def main() -> None:
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    cmd, rest = args[0], args[1:]

    if cmd == "create-admin":
        if not rest:
            sys.exit("usage: python -m app.cli create-admin <username> [password]")
        asyncio.run(create_admin(rest[0], rest[1] if len(rest) > 1 else None))
    elif cmd == "load-feed":
        asyncio.run(load_feed())
    elif cmd == "integrity":
        asyncio.run(integrity())
    elif cmd == "list-users":
        asyncio.run(list_users())
    else:
        sys.exit(f"unknown command {cmd!r}\n{__doc__}")


if __name__ == "__main__":
    main()
