import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..models import User

_PBKDF2_ROUNDS = 200_000
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ROUNDS)
    return f"pbkdf2${_PBKDF2_ROUNDS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(dk.hex(), digest)
    except Exception:
        return False


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "exp": expire},
                      settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret,
                             algorithms=[settings.jwt_algorithm])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


async def current_admin(user: User = Depends(current_user)) -> User:
    """Operator-only routes. Players get a 403, not a 404 -- hiding the route
    would not actually hide anything, and honest errors are easier to debug."""
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "operator access required")
    return user


async def betting_user(user: User = Depends(current_user)) -> User:
    """A suspended customer can still log in and read their history -- they just
    cannot get more money into action."""
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "account suspended - contact your agent")
    return user


async def current_master(user: User = Depends(current_admin)) -> User:
    """Master-only routes: creating agents, running the feed, house-wide risk."""
    if not user.is_master:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "master agent access required")
    return user
