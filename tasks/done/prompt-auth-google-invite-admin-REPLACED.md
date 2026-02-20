# Prompt: Google OAuth + Invite Codes + Admin Panel

## Context
DeckForge is a Tauri 2 desktop app (Svelte 5 frontend) with a FastAPI backend on Railway. The backend has existing JWT auth (anonymous registration), a `users` table, and `auth_tokens` table — but nothing is actually protected yet. Routes accept optional `user_id` without validating Bearer tokens.

**Problem**: Anyone with the app can hit the FastAPI prediction engine and burn Mathew's Claude API credits. We need real authentication.

**What we're building**:
1. Google Sign-In via Google Identity Services (GIS) in the Tauri webview
2. Invite code system — users can't access the app without a valid code
3. Auth middleware on all protected backend routes
4. Admin panel (Jinja2 web UI on Railway) for managing users and invite codes

---

## Section 1: Database Changes

### 1.1 New Models in `backend/app/db/models.py`

Add these models alongside the existing ones:

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

### 1.2 Modify Existing `User` Model

Add Google identity fields to the existing `User` model. Keep `anonymized_id` for backward compatibility but add:

```python
class User(Base):
    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    anonymized_id = Column(Text, unique=True, nullable=False)

    # NEW: Google identity
    email = Column(Text, unique=True, nullable=True)           # Google email
    display_name = Column(Text, nullable=True)                 # Google display name
    avatar_url = Column(Text, nullable=True)                   # Google profile picture URL
    google_sub = Column(Text, unique=True, nullable=True)      # Google subject ID (stable identifier)

    # NEW: Access control
    is_active = Column(Boolean, nullable=False, default=True)  # admin can disable
    is_admin = Column(Boolean, nullable=False, default=False)  # admin panel access
    invite_code_used = Column(Text, nullable=True)             # which code they redeemed

    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_seen_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    app_version = Column(Text)
    plan_tier = Column(Text, nullable=False, default="free")

    auth_tokens = relationship("AuthToken", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
```

### 1.3 New Alembic Migration

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

---

## Section 2: Backend Config Changes

### 2.1 Add to `backend/app/config.py`

Add these fields to the `Settings` class:

```python
# Google OAuth
google_client_id: str = ""          # From Google Cloud Console
google_client_secret: str = ""      # Not needed for ID token verification, but keep for future

# Admin panel
admin_password: str = ""            # Simple password for admin panel login
admin_emails: str = "mdeeb95@gmail.com"  # Comma-separated admin emails
```

### 2.2 Add to `backend/requirements.txt`

```
google-auth>=2.36.0
Jinja2>=3.1.0
python-multipart>=0.0.18
itsdangerous>=2.2.0
```

`google-auth` verifies Google ID tokens. `Jinja2` renders admin templates. `python-multipart` handles form submissions. `itsdangerous` signs admin session cookies.

---

## Section 3: Auth Middleware

### 3.1 Create `backend/app/auth/dependencies.py`

This is the core auth dependency injected into protected routes:

```python
"""Auth dependencies for FastAPI route protection."""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, Request
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

### 3.2 Protect Routes

Add `user: User = Depends(get_current_user)` to every protected route:

**`backend/app/routes/predict.py`** — change the signature:
```python
from app.auth.dependencies import get_current_user
from app.db.models import User

@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: PredictRequest,
    user: User = Depends(get_current_user),  # ADD THIS
    db: AsyncSession = Depends(get_db),
):
    # Replace `request.user_id` usage with `user.id`:
    # prediction_call.user_id = user.id  (not request.user_id)
```

**Apply the same pattern to**:
- `backend/app/routes/feedback.py` — `POST /feedback`
- `backend/app/routes/claude_session.py` — `POST /claude-session`

**Do NOT protect**:
- `GET /health` — must remain public
- `GET /api/v1/templates` — public, templates aren't sensitive
- Auth routes (obviously)

---

## Section 4: Google OAuth Backend

### 4.1 Rewrite `backend/app/routes/auth.py`

Replace the anonymous registration flow with Google OAuth:

```python
"""Auth routes: Google Sign-In + invite code redemption."""
from __future__ import annotations

import uuid
import secrets
import hashlib
import string
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
    """
    Exchange a Google ID token for DeckForge JWT tokens.

    Flow:
    1. Verify the Google ID token with Google's public keys
    2. Extract email, name, avatar, sub
    3. Look up user by google_sub
    4. If new user → return needs_invite=True (no tokens issued yet)
    5. If existing active user → issue fresh JWT tokens
    """
    settings = get_settings()

    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    # Verify the ID token
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

    # Check if user exists
    stmt = select(User).where(User.google_sub == google_sub)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        # New user — check if they've been pre-registered (admin created entry)
        stmt2 = select(User).where(User.email == email)
        result2 = await db.execute(stmt2)
        user = result2.scalar_one_or_none()

    if user is None:
        # Completely new — they need an invite code
        return GoogleAuthResponse(
            needs_invite=True,
            email=email,
            display_name=display_name,
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    # Update Google identity fields (in case name/avatar changed)
    user.google_sub = google_sub
    user.email = email
    user.display_name = display_name
    user.avatar_url = avatar_url
    user.last_seen_at = datetime.now(timezone.utc)
    if request.app_version:
        user.app_version = request.app_version

    # Issue tokens
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
    """
    Redeem an invite code and create a new user account.

    Requires a valid Google ID token + an invite code.
    """
    settings = get_settings()

    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    # Verify Google token again
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
        anonymized_id=f"google_{google_sub[:16]}",  # backward compat
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

    # Increment invite code usage
    invite.times_used += 1

    await db.flush()

    # Issue tokens
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


# Keep the existing refresh endpoint — it doesn't change
@router.post("/auth/refresh", response_model=RefreshResponse)
async def refresh(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh JWT tokens. Same as before."""
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

### 4.2 Update `backend/app/schemas/auth.py`

Replace the existing schemas:

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

---

## Section 5: Admin Panel

### 5.1 Template Directory

Create `backend/app/admin/` directory with:

```
backend/app/admin/
├── __init__.py
├── routes.py          # Admin FastAPI routes
├── templates/
│   ├── base.html      # Layout template
│   ├── login.html     # Admin login page
│   ├── dashboard.html # Main dashboard
│   ├── users.html     # User management
│   └── invites.html   # Invite code management
```

### 5.2 Admin Routes: `backend/app/admin/routes.py`

```python
"""Admin panel routes — Jinja2 server-rendered UI."""
from __future__ import annotations

import secrets
import string
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from app.config import get_settings
from app.db.session import get_db
from app.db.models import User, InviteCode, PredictionCall

logger = logging.getLogger(__name__)
router = APIRouter()
templates = Jinja2Templates(directory="app/admin/templates")

COOKIE_NAME = "deckforge_admin_session"
SESSION_MAX_AGE = 86400  # 24 hours


def _get_serializer() -> URLSafeTimedSerializer:
    settings = get_settings()
    return URLSafeTimedSerializer(settings.jwt_secret)


def _verify_admin_session(request: Request) -> str | None:
    """Returns admin email if session is valid, None otherwise."""
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        return None
    try:
        data = _get_serializer().loads(cookie, max_age=SESSION_MAX_AGE)
        return data.get("email")
    except (BadSignature, SignatureExpired):
        return None


# ─── Login ───────────────────────────────────────────────────────────────────

@router.get("/admin/login", response_class=HTMLResponse)
async def admin_login_page(request: Request):
    if _verify_admin_session(request):
        return RedirectResponse("/admin", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@router.post("/admin/login", response_class=HTMLResponse)
async def admin_login(request: Request, password: str = Form(...)):
    settings = get_settings()
    if password != settings.admin_password:
        return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid password"})

    response = RedirectResponse("/admin", status_code=302)
    session_data = {"email": "admin", "logged_in_at": datetime.now(timezone.utc).isoformat()}
    cookie = _get_serializer().dumps(session_data)
    response.set_cookie(COOKIE_NAME, cookie, httponly=True, samesite="lax", max_age=SESSION_MAX_AGE)
    return response


@router.get("/admin/logout")
async def admin_logout():
    response = RedirectResponse("/admin/login", status_code=302)
    response.delete_cookie(COOKIE_NAME)
    return response


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    admin = _verify_admin_session(request)
    if not admin:
        return RedirectResponse("/admin/login", status_code=302)

    # Gather stats
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0
    total_invites = (await db.execute(select(func.count(InviteCode.id)))).scalar() or 0
    total_predictions = (await db.execute(select(func.count(PredictionCall.id)))).scalar() or 0

    # Recent users
    stmt = select(User).order_by(desc(User.last_seen_at)).limit(10)
    recent_users = (await db.execute(stmt)).scalars().all()

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "total_users": total_users,
        "active_users": active_users,
        "total_invites": total_invites,
        "total_predictions": total_predictions,
        "recent_users": recent_users,
    })


# ─── User Management ────────────────────────────────────────────────────────

@router.get("/admin/users", response_class=HTMLResponse)
async def admin_users(request: Request, db: AsyncSession = Depends(get_db)):
    admin = _verify_admin_session(request)
    if not admin:
        return RedirectResponse("/admin/login", status_code=302)

    stmt = select(User).order_by(desc(User.created_at))
    users = (await db.execute(stmt)).scalars().all()

    return templates.TemplateResponse("users.html", {
        "request": request,
        "users": users,
    })


@router.post("/admin/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    admin = _verify_admin_session(request)
    if not admin:
        raise HTTPException(status_code=401)

    import uuid as _uuid
    stmt = select(User).where(User.id == _uuid.UUID(user_id))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404)

    user.is_active = not user.is_active
    await db.commit()
    return RedirectResponse("/admin/users", status_code=302)


@router.post("/admin/users/{user_id}/toggle-admin")
async def toggle_user_admin(user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    admin = _verify_admin_session(request)
    if not admin:
        raise HTTPException(status_code=401)

    import uuid as _uuid
    stmt = select(User).where(User.id == _uuid.UUID(user_id))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404)

    user.is_admin = not user.is_admin
    await db.commit()
    return RedirectResponse("/admin/users", status_code=302)


# ─── Invite Code Management ─────────────────────────────────────────────────

@router.get("/admin/invites", response_class=HTMLResponse)
async def admin_invites(request: Request, db: AsyncSession = Depends(get_db)):
    admin = _verify_admin_session(request)
    if not admin:
        return RedirectResponse("/admin/login", status_code=302)

    stmt = select(InviteCode).order_by(desc(InviteCode.created_at))
    invites = (await db.execute(stmt)).scalars().all()

    return templates.TemplateResponse("invites.html", {
        "request": request,
        "invites": invites,
    })


def _generate_code(length: int = 8) -> str:
    """Generate a random alphanumeric invite code (uppercase)."""
    chars = string.ascii_uppercase + string.digits
    # Remove confusable characters: O, 0, I, 1, L
    chars = chars.replace("O", "").replace("0", "").replace("I", "").replace("1", "").replace("L", "")
    return "".join(secrets.choice(chars) for _ in range(length))


@router.post("/admin/invites/generate")
async def generate_invite(
    request: Request,
    max_uses: int = Form(1),
    note: str = Form(""),
    count: int = Form(1),
    db: AsyncSession = Depends(get_db),
):
    admin = _verify_admin_session(request)
    if not admin:
        raise HTTPException(status_code=401)

    # Generate 1-50 codes at a time
    count = min(max(count, 1), 50)

    for _ in range(count):
        code = _generate_code()
        # Ensure uniqueness (extremely unlikely to collide but be safe)
        while (await db.execute(select(InviteCode).where(InviteCode.code == code))).scalar_one_or_none():
            code = _generate_code()

        invite = InviteCode(
            code=code,
            max_uses=max_uses,
            note=note.strip() or None,
        )
        db.add(invite)

    await db.commit()
    return RedirectResponse("/admin/invites", status_code=302)


@router.post("/admin/invites/{invite_id}/toggle-active")
async def toggle_invite_active(invite_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    admin = _verify_admin_session(request)
    if not admin:
        raise HTTPException(status_code=401)

    import uuid as _uuid
    stmt = select(InviteCode).where(InviteCode.id == _uuid.UUID(invite_id))
    invite = (await db.execute(stmt)).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404)

    invite.is_active = not invite.is_active
    await db.commit()
    return RedirectResponse("/admin/invites", status_code=302)
```

### 5.3 Mount Admin Routes in `backend/app/main.py`

Add to the route mounting section:

```python
from app.admin.routes import router as admin_router

# Mount admin panel (no /api/v1 prefix — served at /admin)
app.include_router(admin_router, tags=["admin"])

# Serve static files for admin if needed
from fastapi.staticfiles import StaticFiles
# app.mount("/admin/static", StaticFiles(directory="app/admin/static"), name="admin-static")
```

### 5.4 Admin Templates

Create clean, minimal HTML templates. Style with DeckForge colors (`#0d1117` bg, `#0df2f2` cyan accent, `#161b22` surface, `#30363d` border). Use inline CSS — no build tools needed.

**`base.html`**: Layout with nav sidebar (Dashboard, Users, Invites, Logout). DeckForge logo/wordmark at top. Dark theme matching the app.

**`login.html`**: Centered card with password input. Title: "DeckForge Admin". Show error message if login fails.

**`dashboard.html`**: Four stat cards (Total Users, Active Users, Invite Codes, Total Predictions). Below: table of 10 most recently active users with email, last seen, status.

**`users.html`**: Full user table with columns: Email, Display Name, Created, Last Seen, Status (active/inactive badge), Admin (yes/no badge), Invite Code Used. Action buttons: Toggle Active, Toggle Admin.

**`invites.html`**:
- Top: "Generate Codes" form with inputs for Count (default 1), Max Uses (default 1), Note (optional). Submit button.
- Below: table of all invite codes with columns: Code (monospace, large font for easy copy), Created, Max Uses, Times Used, Status (active/expired/depleted badge), Note. Action button: Toggle Active.

**Design rules for templates**:
- Use DeckForge color palette — this should look like it belongs to the app
- Monospace font for codes (JetBrains Mono or system mono)
- No JavaScript frameworks — vanilla HTML forms with POST actions
- Responsive enough to use on a phone (flexbox, not fixed widths)
- Each code should be easily copy-pasteable (large text, click-to-copy if you add minimal JS)

---

## Section 6: Frontend — Login Screen

### 6.1 Google Identity Services Setup

In `index.html`, add the GIS script tag:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### 6.2 Create `src/lib/screens/LoginScreen.svelte`

This is a new screen that gates the entire app. It has two states:

**State 1: Google Sign-In**
- Centered card on the dark background
- DeckForge logo at top (use the existing logo/wordmark if available, otherwise text)
- "Sign in with Google" button (use Google's branded button via GIS `renderButton()`)
- Subtle tagline: "Gamepad-first AI coding"

**State 2: Invite Code Entry** (shown after Google auth returns `needs_invite: true`)
- Same card layout
- Shows user's Google name + avatar (from the auth response)
- "Welcome, {name}. Enter your invite code to continue."
- Text input for invite code (large, monospace, uppercase, centered, max 8 chars)
- Auto-uppercase as user types
- "Activate" button (cyan, DeckForge style)
- Error message display below input
- "Don't have a code? Request access at deckforge.dev" (or wherever)

**Gamepad support**:
- A button = Submit/Activate
- Virtual keyboard for code entry (the Steam Deck has an on-screen keyboard that activates on text input focus)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let state: 'sign_in' | 'invite_code' | 'loading' = 'sign_in';
  let googleIdToken: string = '';
  let userEmail: string = '';
  let userName: string = '';
  let userAvatar: string = '';
  let inviteCode: string = '';
  let error: string = '';

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://deckforge-api-production.up.railway.app';
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  onMount(() => {
    // Initialize Google Identity Services
    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      // Render the branded sign-in button
      const buttonDiv = document.getElementById('google-signin-btn');
      if (buttonDiv) {
        window.google.accounts.id.renderButton(buttonDiv, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280,
        });
      }
    }
  });

  async function handleGoogleResponse(response: { credential: string }) {
    state = 'loading';
    googleIdToken = response.credential;

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: googleIdToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.detail || 'Authentication failed';
        state = 'sign_in';
        return;
      }

      if (data.needs_invite) {
        userEmail = data.email;
        userName = data.display_name;
        state = 'invite_code';
        return;
      }

      // Success — save tokens and proceed
      await saveAuthAndProceed(data);
    } catch (e) {
      error = 'Could not reach server. Check your connection.';
      state = 'sign_in';
    }
  }

  async function submitInviteCode() {
    if (inviteCode.length < 4) {
      error = 'Code is too short';
      return;
    }

    state = 'loading';
    error = '';

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/redeem-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: googleIdToken,
          invite_code: inviteCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.detail || 'Invalid invite code';
        state = 'invite_code';
        return;
      }

      await saveAuthAndProceed(data);
    } catch (e) {
      error = 'Could not reach server.';
      state = 'invite_code';
    }
  }

  async function saveAuthAndProceed(data: any) {
    // Save to disk via the existing auth module
    const { saveTokenToDisk } = await import('../auth/auth');
    // ... save tokens, dispatch 'authenticated' event, parent navigates to L1
  }
</script>
```

### 6.3 Modify `src/lib/auth/auth.ts`

Update the auth module:

1. **Remove** the anonymous `register` flow entirely
2. **Keep** `refreshAuth()`, `getAccessToken()`, `getBackendUrl()`, `scheduleRefresh()`
3. **Add** `saveGoogleAuth(data)` — saves tokens from Google auth response to disk
4. **Add** `logout()` — clears token from memory and disk, returns to login screen
5. **Update** `AuthToken` interface to include `email`, `display_name`, `avatar_url`, `is_admin`
6. **Update** `initAuth()` — try loading from disk + refreshing. If that fails, return null (caller shows LoginScreen instead of registering anonymously)

### 6.4 Update `src/lib/types/data.ts`

Extend `AuthToken`:

```typescript
export interface AuthToken {
  schema_version: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  backend_url: string;
  // NEW
  email: string;
  display_name: string;
  avatar_url?: string;
  is_admin: boolean;
}
```

### 6.5 App Entry Point Gating

In `App.svelte` (or wherever the root router lives), the flow becomes:

```
1. App loads → try initAuth()
2. If initAuth() returns valid token → proceed to L1 (normal app)
3. If initAuth() returns null → show LoginScreen
4. LoginScreen completes auth → save tokens → proceed to L1
```

The LoginScreen is NOT a normal "screen" in the L1/L2/L3 navigation system. It's a gate that sits above all of that. Once authenticated, it never appears again (until token refresh fails or user logs out).

---

## Section 7: Environment Variables

### 7.1 Google Cloud Console Setup (manual, not coded)

The developer (Mathew) needs to:
1. Go to https://console.cloud.google.com
2. Create a project (or use existing)
3. Enable "Google Identity" API
4. Create OAuth 2.0 credentials → "Web application" type
5. Add authorized JavaScript origins: `tauri://localhost`, `http://localhost:1420`
6. Copy the Client ID → set as `GOOGLE_CLIENT_ID` env var on Railway and `VITE_GOOGLE_CLIENT_ID` in `.env`

### 7.2 Railway Environment Variables to Add

```
GOOGLE_CLIENT_ID=<from Google Cloud Console>
ADMIN_PASSWORD=<strong random password>
ADMIN_EMAILS=mdeeb95@gmail.com
```

### 7.3 Local `.env` for Development

```
VITE_GOOGLE_CLIENT_ID=<same client ID>
VITE_BACKEND_URL=http://localhost:8000
```

---

## Section 8: Security Considerations

### 8.1 Things to Get Right
- Google ID tokens are verified server-side using Google's public keys (never trust the client)
- Invite codes use only unambiguous characters (no O/0/I/1/L)
- Admin panel uses signed cookies (itsdangerous), NOT JWT — simpler for server-rendered pages
- All admin routes verify the session cookie before any DB access
- User deactivation immediately blocks token refresh (existing tokens expire naturally within 60 min)
- Rate limit the `/auth/redeem-invite` endpoint to prevent brute-force (add `slowapi` or manual counter)

### 8.2 Things NOT to Do
- Don't store Google access/refresh tokens — we only need the ID token for identity verification
- Don't create a "register" endpoint anymore — all registration goes through Google + invite code
- Don't put the admin password in code — env var only
- Don't make the admin panel a SPA — server-rendered HTML is simpler and more secure for this use case

---

## Section 9: Testing

### 9.1 Backend Unit Tests

Create `backend/tests/test_auth_google.py`:
- Test Google token verification (mock `google.oauth2.id_token.verify_oauth2_token`)
- Test invite code redemption (valid, expired, depleted, deactivated)
- Test auth middleware (valid token, expired token, missing token, deactivated user)
- Test token refresh with deactivated user (should fail)

Create `backend/tests/test_admin.py`:
- Test admin login (correct password, wrong password)
- Test admin session cookie (valid, expired, tampered)
- Test invite code generation (single, batch)
- Test user toggle (active/inactive, admin/non-admin)

### 9.2 Frontend Tests

- Test LoginScreen renders Google button
- Test invite code input (uppercase transform, length validation)
- Test auth flow: token saved to disk after successful login
- Test app gating: LoginScreen shown when no valid token exists

---

## Section 10: File Change Summary

### New Files
```
backend/app/auth/__init__.py
backend/app/auth/dependencies.py
backend/app/admin/__init__.py
backend/app/admin/routes.py
backend/app/admin/templates/base.html
backend/app/admin/templates/login.html
backend/app/admin/templates/dashboard.html
backend/app/admin/templates/users.html
backend/app/admin/templates/invites.html
backend/alembic/versions/002_google_auth_invite_codes.py
src/lib/screens/LoginScreen.svelte
backend/tests/test_auth_google.py
backend/tests/test_admin.py
```

### Modified Files
```
backend/app/db/models.py          — Add InviteCode model, extend User model
backend/app/config.py             — Add google_client_id, admin_password, admin_emails
backend/app/routes/auth.py        — Replace anonymous flow with Google OAuth + invite codes
backend/app/schemas/auth.py       — Replace schemas for new auth flow
backend/app/routes/predict.py     — Add get_current_user dependency
backend/app/routes/feedback.py    — Add get_current_user dependency
backend/app/routes/claude_session.py — Add get_current_user dependency
backend/app/main.py               — Mount admin routes, add Jinja2 setup
backend/requirements.txt          — Add google-auth, Jinja2, python-multipart, itsdangerous
src/lib/auth/auth.ts              — Replace anonymous flow, add saveGoogleAuth, logout
src/lib/types/data.ts             — Extend AuthToken interface
src/App.svelte                    — Add login gate logic
index.html                        — Add GIS script tag
```

### Order of Operations
1. Add new Python dependencies (`pip install`)
2. Create database migration and run it
3. Build auth middleware (`dependencies.py`)
4. Rewrite auth routes (Google OAuth + invite codes)
5. Protect existing routes with middleware
6. Build admin panel (routes + templates)
7. Build LoginScreen.svelte
8. Update auth.ts and App.svelte
9. Test end-to-end locally
10. Deploy to Railway with new env vars
