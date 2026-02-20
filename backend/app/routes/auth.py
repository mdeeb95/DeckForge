"""Auth routes: Google Sign-In + invite code redemption."""
from __future__ import annotations

import uuid
import hashlib
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db
from app.db.models import User, AuthToken, InviteCode
from app.schemas.auth import (
    GoogleAuthRequest,
    GoogleAuthResponse,
    RedeemInviteRequest,
    RedeemInviteResponse,
    RefreshRequest,
    RefreshResponse,
)

router = APIRouter()


def _create_tokens(user_id: str, settings) -> tuple[str, str, datetime]:
    """Create access and refresh JWT tokens."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    refresh_expires = now + timedelta(days=settings.jwt_refresh_token_expire_days)

    access_payload = {"sub": user_id, "exp": expires_at, "type": "access"}
    refresh_payload = {"sub": user_id, "exp": refresh_expires, "type": "refresh"}

    access_token = jwt.encode(access_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    refresh_token = jwt.encode(refresh_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    return access_token, refresh_token, expires_at


def _store_token_hashes(access_token: str, refresh_token: str, user_id: uuid.UUID, expires_at: datetime) -> AuthToken:
    """Create an AuthToken record with bcrypt-hashed tokens."""
    return AuthToken(
        user_id=user_id,
        token_hash=bcrypt.hashpw(
            hashlib.sha256(access_token.encode()).hexdigest().encode(),
            bcrypt.gensalt(),
        ).decode(),
        refresh_hash=bcrypt.hashpw(
            hashlib.sha256(refresh_token.encode()).hexdigest().encode(),
            bcrypt.gensalt(),
        ).decode(),
        expires_at=expires_at,
    )


@router.post("/auth/google", response_model=GoogleAuthResponse)
async def google_auth(
    request: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a Google ID token for DeckForge JWT tokens."""
    settings = get_settings()

    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    try:
        idinfo = id_token.verify_oauth2_token(
            request.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    google_sub = idinfo["sub"]
    email = idinfo.get("email", "")
    display_name = idinfo.get("name", "")
    avatar_url = idinfo.get("picture", "")

    if not idinfo.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Email not verified by Google")

    # Check if user exists (by google_sub first, then email)
    stmt = select(User).where(User.google_sub == google_sub)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        stmt2 = select(User).where(User.email == email)
        result2 = await db.execute(stmt2)
        user = result2.scalar_one_or_none()

    if user is None:
        return GoogleAuthResponse(needs_invite=True, email=email, display_name=display_name)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    # Update identity fields
    user.google_sub = google_sub
    user.email = email
    user.display_name = display_name
    user.avatar_url = avatar_url
    user.last_seen_at = datetime.now(timezone.utc)
    if request.app_version:
        user.app_version = request.app_version

    access_token, refresh_token, expires_at = _create_tokens(str(user.id), settings)
    db.add(_store_token_hashes(access_token, refresh_token, user.id, expires_at))
    await db.commit()

    return GoogleAuthResponse(
        needs_invite=False,
        user_id=str(user.id),
        email=email,
        display_name=display_name,
        avatar_url=avatar_url,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at.isoformat(),
        is_admin=user.is_admin,
    )


@router.post("/auth/redeem-invite", response_model=RedeemInviteResponse)
async def redeem_invite(
    request: RedeemInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Redeem an invite code and create a new user account."""
    settings = get_settings()

    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    try:
        idinfo = id_token.verify_oauth2_token(
            request.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    google_sub = idinfo["sub"]
    email = idinfo.get("email", "")
    display_name = idinfo.get("name", "")
    avatar_url = idinfo.get("picture", "")

    # Validate invite code
    code_normalized = request.invite_code.strip().upper()
    stmt = select(InviteCode).where(InviteCode.code == code_normalized)
    result = await db.execute(stmt)
    invite = result.scalar_one_or_none()

    if invite is None:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    if not invite.is_active:
        raise HTTPException(status_code=400, detail="Invite code has been deactivated")
    if invite.times_used >= invite.max_uses:
        raise HTTPException(status_code=400, detail="Invite code has been fully redeemed")
    if invite.expires_at:
        expires = invite.expires_at if invite.expires_at.tzinfo else invite.expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Invite code has expired")

    # Check user doesn't already exist
    stmt2 = select(User).where(User.google_sub == google_sub)
    result2 = await db.execute(stmt2)
    if result2.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Account already exists")

    # Create user
    user = User(
        anonymized_id=f"google_{google_sub[:16]}",
        email=email,
        display_name=display_name,
        avatar_url=avatar_url,
        google_sub=google_sub,
        invite_code_used=code_normalized,
        is_active=True,
        is_admin=email in [e.strip() for e in settings.admin_emails.split(",")],
        app_version=request.app_version,
    )
    db.add(user)
    invite.times_used += 1
    await db.flush()

    access_token, refresh_token, expires_at = _create_tokens(str(user.id), settings)
    db.add(_store_token_hashes(access_token, refresh_token, user.id, expires_at))
    await db.commit()

    return RedeemInviteResponse(
        user_id=str(user.id),
        email=email,
        display_name=display_name,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at.isoformat(),
    )


@router.post("/auth/refresh", response_model=RefreshResponse)
async def refresh(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh JWT tokens."""
    settings = get_settings()

    try:
        payload = jwt.decode(
            request.refresh_token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    user_id = payload["sub"]
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    user.last_seen_at = datetime.now(timezone.utc)

    access_token, refresh_token, expires_at = _create_tokens(user_id, settings)
    db.add(_store_token_hashes(access_token, refresh_token, uuid.UUID(user_id), expires_at))
    await db.commit()

    return RefreshResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at.isoformat(),
    )
