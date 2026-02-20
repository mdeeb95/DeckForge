"""Admin panel API routes — JSON endpoints for the Svelte admin SPA."""
from __future__ import annotations

import secrets
import logging
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from pydantic import BaseModel

from app.config import get_settings
from app.db.session import get_db
from app.db.models import User, InviteCode, PredictionCall

logger = logging.getLogger(__name__)
router = APIRouter()

COOKIE_NAME = "deckforge_admin_session"
SESSION_MAX_AGE = 86400  # 24 hours


def _get_serializer() -> URLSafeTimedSerializer:
    settings = get_settings()
    return URLSafeTimedSerializer(settings.jwt_secret)


def _verify_admin(request: Request) -> None:
    """Raise 401 if admin session is invalid."""
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        _get_serializer().loads(cookie, max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Session expired")


# ─── Auth ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str

@router.post("/admin/login")
async def admin_login(request: Request, body: LoginRequest):
    settings = get_settings()
    if body.password != settings.admin_password:
        raise HTTPException(status_code=401, detail="Invalid password")

    session_data = {"email": "admin", "ts": datetime.now(timezone.utc).isoformat()}
    cookie = _get_serializer().dumps(session_data)

    response = JSONResponse({"ok": True})
    response.set_cookie(
        COOKIE_NAME, cookie,
        httponly=True, samesite="lax", max_age=SESSION_MAX_AGE,
    )
    return response


@router.post("/admin/logout")
async def admin_logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE_NAME)
    return response


@router.get("/admin/me")
async def admin_me(request: Request):
    """Check if admin session is valid. Used by SPA on load."""
    _verify_admin(request)
    return {"authenticated": True}


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/admin/stats")
async def admin_stats(request: Request, db: AsyncSession = Depends(get_db)):
    _verify_admin(request)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )).scalar() or 0
    total_invites = (await db.execute(select(func.count(InviteCode.id)))).scalar() or 0
    total_predictions = (await db.execute(select(func.count(PredictionCall.id)))).scalar() or 0

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_invites": total_invites,
        "total_predictions": total_predictions,
    }


@router.get("/admin/recent-users")
async def admin_recent_users(request: Request, db: AsyncSession = Depends(get_db)):
    _verify_admin(request)

    stmt = select(User).order_by(desc(User.last_seen_at)).limit(10)
    users = (await db.execute(stmt)).scalars().all()

    return [_user_to_dict(u) for u in users]


# ─── Users ───────────────────────────────────────────────────────────────────

@router.get("/admin/users")
async def admin_users(request: Request, db: AsyncSession = Depends(get_db)):
    _verify_admin(request)

    stmt = select(User).order_by(desc(User.created_at))
    users = (await db.execute(stmt)).scalars().all()

    return [_user_to_dict(u) for u in users]


@router.post("/admin/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    _verify_admin(request)

    stmt = select(User).where(User.id == _uuid.UUID(user_id))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = not user.is_active
    await db.commit()
    return _user_to_dict(user)


@router.post("/admin/users/{user_id}/toggle-admin")
async def toggle_user_admin(user_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    _verify_admin(request)

    stmt = select(User).where(User.id == _uuid.UUID(user_id))
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_admin = not user.is_admin
    await db.commit()
    return _user_to_dict(user)


# ─── Invite Codes ────────────────────────────────────────────────────────────

@router.get("/admin/invites")
async def admin_invites(request: Request, db: AsyncSession = Depends(get_db)):
    _verify_admin(request)

    stmt = select(InviteCode).order_by(desc(InviteCode.created_at))
    invites = (await db.execute(stmt)).scalars().all()

    return [_invite_to_dict(i) for i in invites]


class GenerateInvitesRequest(BaseModel):
    count: int = 1
    max_uses: int = 1
    note: str = ""

@router.post("/admin/invites/generate")
async def generate_invites(
    request: Request,
    body: GenerateInvitesRequest,
    db: AsyncSession = Depends(get_db),
):
    _verify_admin(request)

    count = min(max(body.count, 1), 50)
    created = []

    for _ in range(count):
        code = _generate_code()
        while (await db.execute(select(InviteCode).where(InviteCode.code == code))).scalar_one_or_none():
            code = _generate_code()

        invite = InviteCode(
            code=code,
            max_uses=body.max_uses,
            note=body.note.strip() or None,
        )
        db.add(invite)
        await db.flush()
        created.append(_invite_to_dict(invite))

    await db.commit()
    return created


@router.post("/admin/invites/{invite_id}/toggle-active")
async def toggle_invite_active(invite_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    _verify_admin(request)

    stmt = select(InviteCode).where(InviteCode.id == _uuid.UUID(invite_id))
    invite = (await db.execute(stmt)).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    invite.is_active = not invite.is_active
    await db.commit()
    return _invite_to_dict(invite)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _generate_code(length: int = 8) -> str:
    """Generate a random alphanumeric invite code. No confusable chars (O/0/I/1/L)."""
    chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(chars) for _ in range(length))


def _user_to_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "invite_code_used": user.invite_code_used,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_seen_at": user.last_seen_at.isoformat() if user.last_seen_at else None,
        "app_version": user.app_version,
    }


def _invite_to_dict(invite: InviteCode) -> dict:
    return {
        "id": str(invite.id),
        "code": invite.code,
        "max_uses": invite.max_uses,
        "times_used": invite.times_used,
        "is_active": invite.is_active,
        "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
        "note": invite.note,
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
    }
