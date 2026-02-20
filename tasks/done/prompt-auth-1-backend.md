# Prompt: Auth Backend — Google OAuth, Invite Codes, Middleware

## Context
DeckForge has a FastAPI backend on Railway with an existing JWT auth system that currently does anonymous registration. The `users` table, `auth_tokens` table, JWT generation, and bcrypt token hashing all exist. But NO routes are actually protected — the predict endpoint accepts an optional `user_id` without validating Bearer tokens. Anyone can hit the API and burn Claude credits.

This prompt adds: Google OAuth verification, an invite code system, auth middleware on protected routes, and the database migration for all of it.

**Important**: This prompt is backend-only. It does NOT touch the frontend or admin panel — those are separate prompts. After this prompt, the backend will be ready to accept Google auth requests, but nothing in the Tauri app calls them yet.

---

## Section 1: New Dependencies

Add to `backend/requirements.txt`:
```
google-auth>=2.36.0
python-multipart>=0.0.18
```

`google-auth` verifies Google ID tokens server-side using Google's public keys. `python-multipart` is needed for form data handling (used later by admin panel, but add now to avoid missing dependency).

Run `pip install -r requirements.txt` to verify everything resolves.

---

## Section 2: Config Changes

### 2.1 Modify `backend/app/config.py`

Add these fields to the `Settings` class (alongside existing fields, after the `jwt_refresh_token_expire_days` line):

```python
# Google OAuth
google_client_id: str = ""          # From Google Cloud Console
google_client_secret: str = ""      # Not needed for ID token verification, but keep for future

# Admin
admin_emails: str = "mdeeb95@gmail.com"  # Comma-separated emails that auto-get is_admin=True
```

---

## Section 3: Database Changes

### 3.1 Modify `backend/app/db/models.py`

**Extend the existing `User` model** — add these columns after `anonymized_id`:

```python
# Google identity
email = Column(Text, unique=True, nullable=True)           # Google email
display_name = Column(Text, nullable=True)                 # Google display name
avatar_url = Column(Text, nullable=True)                   # Google profile picture URL
google_sub = Column(Text, unique=True, nullable=True)      # Google subject ID (stable identifier)

# Access control
is_active = Column(Boolean, nullable=False, default=True)  # admin can disable
is_admin = Column(Boolean, nullable=False, default=False)  # admin panel access
invite_code_used = Column(Text, nullable=True)             # which code they redeemed
```

Keep all existing columns (`created_at`, `last_seen_at`, `app_version`, `plan_tier`, relationships). Don't remove `anonymized_id` — it's used for backward compatibility.

**Add a new `InviteCode` model** at the bottom of the file:

```python
# ─── invite_codes ────────────────────────────────────────────────────────────

class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    code = Column(Text, unique=True, nullable=False)          # 8-char alphanumeric
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_by = Column(Text, nullable=False, default="admin") # who generated it
    max_uses = Column(Integer, nullable=False, default=1)      # how many times it can be redeemed
    times_used = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True))               # null = never expires
    is_active = Column(Boolean, nullable=False, default=True)  # admin can disable
    note = Column(Text)                                        # admin note ("for beta testers", etc.)
```

### 3.2 Create Alembic Migration

Create `backend/alembic/versions/002_google_auth_invite_codes.py`:

```python
"""Google auth and invite codes

Revision ID: 002
Revises: 001
Create Date: 2026-02-20
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add Google identity columns to users
    op.add_column("users", sa.Column("email", sa.Text(), unique=True, nullable=True))
    op.add_column("users", sa.Column("display_name", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_sub", sa.Text(), unique=True, nullable=True))
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true_()))
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false_()))
    op.add_column("users", sa.Column("invite_code_used", sa.Text(), nullable=True))

    # Create invite_codes table
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.Text(), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Text(), nullable=False, server_default="admin"),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("times_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true_()),
        sa.Column("note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("invite_codes")
    op.drop_column("users", "invite_code_used")
    op.drop_column("users", "is_admin")
    op.drop_column("users", "is_active")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "display_name")
    op.drop_column("users", "email")
```

Run the migration locally to verify: `cd backend && alembic upgrade head`

---

## Section 4: Auth Middleware

### 4.1 Create `backend/app/auth/__init__.py`

Empty file.

### 4.2 Create `backend/app/auth/dependencies.py`

This is the core auth dependency — a FastAPI `Depends()` that extracts the JWT from the `Authorization: Bearer` header, validates it, looks up the user, and returns the `User` ORM object. If anything fails, it raises `401` or `403`.

```python
"""Auth dependencies for FastAPI route protection."""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db
from app.db.models import User

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Extract and validate JWT from Authorization header.
    Returns the User ORM object.
    Raises 401 if token is missing/invalid/expired.
    Raises 403 if user is deactivated.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    settings = get_settings()
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Not an access token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Look up user
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    # Update last_seen
    user.last_seen_at = datetime.now(timezone.utc)
    await db.commit()

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """
    Same as get_current_user but returns None instead of raising 401.
    Use for endpoints that work in both authenticated and anonymous modes.
    """
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
```

### 4.3 Protect Routes

Add `user: User = Depends(get_current_user)` to every route that costs money or accesses user data.

**`backend/app/routes/predict.py`** — change the function signature:
```python
from app.auth.dependencies import get_current_user
from app.db.models import User

@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: PredictRequest,
    user: User = Depends(get_current_user),  # ADD THIS
    db: AsyncSession = Depends(get_db),
):
```

Then replace the `user_id` usage on line 107:
```python
# BEFORE:
user_id=uuid.UUID(request.user_id) if request.user_id else uuid.uuid4(),

# AFTER:
user_id=user.id,
```

**`backend/app/routes/feedback.py`** — add the same `user: User = Depends(get_current_user)` parameter to the POST handler.

**`backend/app/routes/claude_session.py`** — add the same `user: User = Depends(get_current_user)` parameter to the POST handler.

**Do NOT protect these routes** (they must stay public):
- `GET /health`
- `GET /api/v1/templates`
- All auth routes (`/api/v1/auth/*`)

---

## Section 5: Google OAuth Endpoints

### 5.1 Rewrite `backend/app/schemas/auth.py`

Replace the entire file. Keep `RefreshRequest` and `RefreshResponse` as-is, but replace the register schemas with Google auth schemas:

```python
"""Auth request/response schemas."""
from __future__ import annotations
from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    id_token: str                    # Google ID token from GIS
    app_version: str | None = None


class GoogleAuthResponse(BaseModel):
    needs_invite: bool               # True if user needs to enter an invite code
    email: str = ""
    display_name: str = ""
    avatar_url: str | None = None
    user_id: str | None = None       # Only set if needs_invite=False
    access_token: str | None = None
    refresh_token: str | None = None
    expires_at: str | None = None
    is_admin: bool = False


class RedeemInviteRequest(BaseModel):
    id_token: str                    # Google ID token (verified again)
    invite_code: str                 # The invite code to redeem
    app_version: str | None = None


class RedeemInviteResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    access_token: str
    refresh_token: str
    expires_at: str


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: str
```

### 5.2 Rewrite `backend/app/routes/auth.py`

Replace the entire file. The new auth routes:

1. **`POST /api/v1/auth/google`** — Takes a Google ID token, verifies it server-side using `google.oauth2.id_token.verify_oauth2_token()`, extracts `sub/email/name/picture`. Looks up user by `google_sub` (then falls back to `email`). If user exists and is active → issue DeckForge JWT tokens. If user doesn't exist → return `needs_invite: true` (no tokens).

2. **`POST /api/v1/auth/redeem-invite`** — Takes a Google ID token + invite code. Verifies the Google token again. Validates the invite code (exists, active, not depleted, not expired). Creates a new `User` with Google identity fields. Increments `invite.times_used`. Issues JWT tokens. Auto-sets `is_admin=True` if the email is in `settings.admin_emails`.

3. **`POST /api/v1/auth/refresh`** — Keep the existing refresh logic but add `is_active` check — if user has been deactivated, refresh should fail with 403.

Key implementation details:
- Extract helper `_create_tokens(user_id, settings)` — same as current, returns `(access_token, refresh_token, expires_at)`
- Extract helper `_store_token_hashes(access_token, refresh_token, user_id, expires_at)` — creates `AuthToken` record with bcrypt hashes
- Invite codes are normalized: `strip().upper()` before lookup
- `anonymized_id` for new Google users: `f"google_{google_sub[:16]}"` for backward compatibility
- Verify `email_verified` claim from Google — reject unverified emails

Full implementation reference (use this as the exact code):

```python
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
    if invite.expires_at and datetime.now(timezone.utc) > invite.expires_at:
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
```

---

## Section 6: Testing

### 6.1 Create `backend/tests/test_auth.py`

Test the auth system with mocked Google token verification:

```python
# Mock google.oauth2.id_token.verify_oauth2_token to return controlled payloads
# Test cases:
# 1. google_auth with new user → needs_invite=True
# 2. google_auth with existing user → returns tokens
# 3. google_auth with deactivated user → 403
# 4. google_auth with invalid token → 401
# 5. redeem_invite with valid code → creates user, returns tokens
# 6. redeem_invite with depleted code → 400
# 7. redeem_invite with expired code → 400
# 8. redeem_invite with deactivated code → 400
# 9. redeem_invite with duplicate google_sub → 409
# 10. refresh with deactivated user → 403
# 11. get_current_user middleware: valid token → returns user
# 12. get_current_user middleware: expired token → 401
# 13. get_current_user middleware: missing header → 401
# 14. get_current_user middleware: deactivated user → 403
# 15. predict endpoint without Bearer token → 401
```

Use `pytest` + `httpx.AsyncClient` + `unittest.mock.patch` for Google token mocking.

---

## Section 7: Verification Checklist

After completion, verify:

1. `cd backend && alembic upgrade head` runs without error (on local SQLite)
2. `POST /api/v1/auth/google` with a mock/real Google ID token returns the expected response
3. `POST /api/v1/predict` without a Bearer token returns 401
4. `POST /api/v1/predict` with a valid Bearer token returns predictions
5. `POST /api/v1/auth/refresh` with a deactivated user returns 403
6. All existing tests still pass (`pytest`)
7. The server starts without import errors (`uvicorn app.main:app`)

---

## File Change Summary

### New Files
```
backend/app/auth/__init__.py
backend/app/auth/dependencies.py
backend/alembic/versions/002_google_auth_invite_codes.py
backend/tests/test_auth.py
```

### Modified Files
```
backend/app/db/models.py       — Extend User model + add InviteCode model
backend/app/config.py          — Add google_client_id, google_client_secret, admin_emails
backend/app/routes/auth.py     — Replace anonymous flow with Google OAuth + invite codes
backend/app/schemas/auth.py    — Replace schemas for new auth flow
backend/app/routes/predict.py  — Add get_current_user dependency, use user.id
backend/app/routes/feedback.py — Add get_current_user dependency
backend/app/routes/claude_session.py — Add get_current_user dependency
backend/requirements.txt       — Add google-auth, python-multipart
```
