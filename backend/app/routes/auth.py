from __future__ import annotations

import uuid
import hashlib
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db
from app.db.models import User, AuthToken
from app.schemas.auth import (
    RegisterRequest,
    RegisterResponse,
    RefreshRequest,
    RefreshResponse,
)

router = APIRouter()


def _create_tokens(user_id: str, settings) -> tuple[str, str, datetime]:
    """Create access and refresh JWT tokens."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    refresh_expires = now + timedelta(days=settings.jwt_refresh_token_expire_days)

    access_payload = {
        "sub": user_id,
        "exp": expires_at,
        "type": "access",
    }
    refresh_payload = {
        "sub": user_id,
        "exp": refresh_expires,
        "type": "refresh",
    }

    access_token = jwt.encode(access_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    refresh_token = jwt.encode(refresh_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    return access_token, refresh_token, expires_at


@router.post("/auth/register", response_model=RegisterResponse)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create an anonymous user and return JWT tokens."""
    settings = get_settings()

    # Check if user already exists
    stmt = select(User).where(User.anonymized_id == request.anonymized_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        # Return fresh tokens for existing user
        user_id = str(existing.id)
        existing.last_seen_at = datetime.now(timezone.utc)
        if request.app_version:
            existing.app_version = request.app_version
    else:
        # Create new user
        user = User(
            anonymized_id=request.anonymized_id,
            app_version=request.app_version,
        )
        db.add(user)
        await db.flush()
        user_id = str(user.id)

    # Create tokens
    access_token, refresh_token, expires_at = _create_tokens(user_id, settings)

    # Store token hashes
    token_record = AuthToken(
        user_id=uuid.UUID(user_id),
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
    db.add(token_record)
    await db.commit()

    return RegisterResponse(
        user_id=user_id,
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

    # Verify user exists
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.last_seen_at = datetime.now(timezone.utc)

    # Create new tokens
    access_token, refresh_token, expires_at = _create_tokens(user_id, settings)

    # Store new token hashes
    token_record = AuthToken(
        user_id=uuid.UUID(user_id),
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
    db.add(token_record)
    await db.commit()

    return RefreshResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at.isoformat(),
    )
