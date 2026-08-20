from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import ledger
from ..core.money import from_micros
from ..core.security import create_access_token, current_user, verify_password
from ..db import get_session
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    """Login only. There is no public registration: operators are created with
    `python -m app.cli create-admin`, customers are booked by an agent."""
    username: str = Field(..., min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(..., min_length=2, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    username: str
    balance: str
    is_admin: bool = False
    is_master: bool = False
    is_active: bool = True


@router.post("/login", response_model=TokenResponse)
async def login(body: Credentials, session: AsyncSession = Depends(get_session)):
    user = (await session.execute(
        select(User).where(User.username == body.username))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "bad username or password")

    wallet = await ledger.wallet_for(session, user.id)
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()

    return TokenResponse(access_token=create_access_token(user.id),
                         username=user.username, balance=str(from_micros(balance)),
                         is_admin=bool(user.is_admin), is_master=bool(user.is_master),
                         is_active=bool(user.is_active))


@router.get("/me", response_model=TokenResponse)
async def me(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    wallet = await ledger.wallet_for(session, user.id)
    balance = await ledger.balance_of(session, wallet.id)
    await session.commit()
    return TokenResponse(access_token="", username=user.username,
                         balance=str(from_micros(balance)), is_admin=bool(user.is_admin),
                         is_master=bool(user.is_master), is_active=bool(user.is_active))


class PasswordCheck(BaseModel):
    password: str


@router.post("/verify")
async def verify(body: PasswordCheck, user: User = Depends(current_user)):
    """The classic confirm-your-wagers gate: re-enter your password to place.
    Rate-limited by nature (a wrong guess costs a full round trip)."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "wrong password")
    return {"ok": True}
