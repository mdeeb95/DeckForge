"""Auth system tests — Google OAuth, invite codes, middleware, route protection."""
from __future__ import annotations

import uuid
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.db.models import User, InviteCode
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import make_access_token, make_refresh_token, make_expired_token, make_stored_access_token


# ─── Helpers ─────────────────────────────────────────────────────────────────

MOCK_GOOGLE_PAYLOAD = {
    "sub": "google_sub_new_user_123",
    "email": "newuser@example.com",
    "name": "New User",
    "picture": "https://lh3.googleusercontent.com/photo.jpg",
    "email_verified": True,
}

MOCK_GOOGLE_EXISTING = {
    "sub": "test_google_sub_12345",
    "email": "test@example.com",
    "name": "Test User",
    "picture": "https://lh3.googleusercontent.com/existing.jpg",
    "email_verified": True,
}

MOCK_GOOGLE_DEACTIVATED = {
    "sub": "deactivated_google_sub",
    "email": "deactivated@example.com",
    "name": "Deactivated User",
    "picture": "",
    "email_verified": True,
}

MOCK_GOOGLE_UNVERIFIED = {
    "sub": "unverified_sub_123",
    "email": "unverified@example.com",
    "name": "Unverified",
    "picture": "",
    "email_verified": False,
}


def _patch_google_verify(payload):
    """Return a patch context manager that mocks Google token verification."""
    return patch(
        "app.routes.auth.id_token.verify_oauth2_token",
        return_value=payload,
    )


def _patch_google_client_id():
    """Patch settings to have a google_client_id set."""
    return patch(
        "app.routes.auth.get_settings",
        return_value=MagicMock(
            google_client_id="test-client-id.apps.googleusercontent.com",
            google_client_secret="",
            admin_emails="mdeeb95@gmail.com",
            jwt_secret="dev-secret-change-in-production",
            jwt_algorithm="HS256",
            jwt_access_token_expire_minutes=60,
            jwt_refresh_token_expire_days=30,
        ),
    )


# ─── 1. google_auth: new user → needs_invite=True ───────────────────────────

@pytest.mark.asyncio
async def test_google_auth_new_user_needs_invite(client: AsyncClient):
    """New Google user who hasn't redeemed an invite gets needs_invite=True."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_PAYLOAD):
        resp = await client.post("/api/v1/auth/google", json={
            "id_token": "fake-google-token",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["needs_invite"] is True
    assert data["email"] == "newuser@example.com"
    assert data["access_token"] is None


# ─── 2. google_auth: existing user → returns tokens ─────────────────────────

@pytest.mark.asyncio
async def test_google_auth_existing_user_returns_tokens(client: AsyncClient, test_user: User):
    """Existing active user gets JWT tokens back."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_EXISTING):
        resp = await client.post("/api/v1/auth/google", json={
            "id_token": "fake-google-token",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["needs_invite"] is False
    assert data["access_token"] is not None
    assert data["refresh_token"] is not None
    assert data["user_id"] == str(test_user.id)


# ─── 3. google_auth: deactivated user → 403 ─────────────────────────────────

@pytest.mark.asyncio
async def test_google_auth_deactivated_user_403(client: AsyncClient, deactivated_user: User):
    """Deactivated user gets 403."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_DEACTIVATED):
        resp = await client.post("/api/v1/auth/google", json={
            "id_token": "fake-google-token",
        })
    assert resp.status_code == 403
    assert "deactivated" in resp.json()["detail"].lower()


# ─── 4. google_auth: invalid token → 401 ────────────────────────────────────

@pytest.mark.asyncio
async def test_google_auth_invalid_token_401(client: AsyncClient):
    """Invalid Google token returns 401."""
    with _patch_google_client_id(), \
         patch("app.routes.auth.id_token.verify_oauth2_token", side_effect=ValueError("Bad token")):
        resp = await client.post("/api/v1/auth/google", json={
            "id_token": "bad-token",
        })
    assert resp.status_code == 401
    assert "Invalid Google token" in resp.json()["detail"]


# ─── 5. redeem_invite: valid code → creates user + tokens ───────────────────

@pytest.mark.asyncio
async def test_redeem_invite_valid_code(client: AsyncClient, invite_code: InviteCode):
    """Valid invite code creates user and returns tokens."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_PAYLOAD):
        resp = await client.post("/api/v1/auth/redeem-invite", json={
            "id_token": "fake-google-token",
            "invite_code": "testcode",  # should be normalized to TESTCODE
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "newuser@example.com"
    assert data["access_token"] is not None
    assert data["user_id"] is not None


# ─── 6. redeem_invite: depleted code → 400 ──────────────────────────────────

@pytest.mark.asyncio
async def test_redeem_invite_depleted_code_400(client: AsyncClient, depleted_invite: InviteCode):
    """Fully used invite code returns 400."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_PAYLOAD):
        resp = await client.post("/api/v1/auth/redeem-invite", json={
            "id_token": "fake-google-token",
            "invite_code": "DEPLETED",
        })
    assert resp.status_code == 400
    assert "fully redeemed" in resp.json()["detail"].lower()


# ─── 7. redeem_invite: expired code → 400 ───────────────────────────────────

@pytest.mark.asyncio
async def test_redeem_invite_expired_code_400(client: AsyncClient, expired_invite: InviteCode):
    """Expired invite code returns 400."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_PAYLOAD):
        resp = await client.post("/api/v1/auth/redeem-invite", json={
            "id_token": "fake-google-token",
            "invite_code": "EXPIRED1",
        })
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


# ─── 8. redeem_invite: deactivated code → 400 ───────────────────────────────

@pytest.mark.asyncio
async def test_redeem_invite_deactivated_code_400(client: AsyncClient, deactivated_invite: InviteCode):
    """Deactivated invite code returns 400."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_PAYLOAD):
        resp = await client.post("/api/v1/auth/redeem-invite", json={
            "id_token": "fake-google-token",
            "invite_code": "DISABLED",
        })
    assert resp.status_code == 400
    assert "deactivated" in resp.json()["detail"].lower()


# ─── 9. redeem_invite: duplicate google_sub → 409 ───────────────────────────

@pytest.mark.asyncio
async def test_redeem_invite_duplicate_user_409(client: AsyncClient, test_user: User, invite_code: InviteCode):
    """User who already exists gets 409."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_EXISTING):
        resp = await client.post("/api/v1/auth/redeem-invite", json={
            "id_token": "fake-google-token",
            "invite_code": "TESTCODE",
        })
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"].lower()


# ─── 10. refresh: deactivated user → 403 ────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_deactivated_user_403(client: AsyncClient, deactivated_user: User):
    """Refresh for deactivated user returns 403."""
    token = make_refresh_token(str(deactivated_user.id))
    resp = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": token,
    })
    assert resp.status_code == 403
    assert "deactivated" in resp.json()["detail"].lower()


# ─── 11. middleware: valid token → returns user ──────────────────────────────

@pytest.mark.asyncio
async def test_middleware_valid_token(client: AsyncClient, test_user: User, db_session: AsyncSession):
    """Valid Bearer token on a protected endpoint succeeds."""
    token = await make_stored_access_token(test_user, db_session)
    # Use the feedback endpoint as a simple protected route
    resp = await client.post(
        "/api/v1/feedback",
        json={"trace_id": "test-trace", "user_action": "selected"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


# ─── 12. middleware: expired token → 401 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_middleware_expired_token_401(client: AsyncClient, test_user: User):
    """Expired token returns 401."""
    token = make_expired_token(str(test_user.id))
    resp = await client.post(
        "/api/v1/feedback",
        json={"trace_id": "test-trace", "user_action": "selected"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


# ─── 13. middleware: missing header → 401 ────────────────────────────────────

@pytest.mark.asyncio
async def test_middleware_missing_header_401(client: AsyncClient):
    """No Authorization header returns 401."""
    resp = await client.post(
        "/api/v1/feedback",
        json={"trace_id": "test-trace", "user_action": "selected"},
    )
    assert resp.status_code == 401


# ─── 14. middleware: deactivated user → 403 ──────────────────────────────────

@pytest.mark.asyncio
async def test_middleware_deactivated_user_403(client: AsyncClient, deactivated_user: User):
    """Valid token for deactivated user returns 403."""
    token = make_access_token(str(deactivated_user.id))
    resp = await client.post(
        "/api/v1/feedback",
        json={"trace_id": "test-trace", "user_action": "selected"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# ─── 15. predict without Bearer → 401 ───────────────────────────────────────

@pytest.mark.asyncio
async def test_predict_without_bearer_401(client: AsyncClient):
    """Predict endpoint without Bearer token returns 401."""
    resp = await client.post("/api/v1/predict", json={
        "call_type": "level_2_feature",
        "context_payload": "test context",
    })
    assert resp.status_code == 401


# ─── 16. google_auth: unverified email → 401 ────────────────────────────────

@pytest.mark.asyncio
async def test_google_auth_unverified_email_401(client: AsyncClient):
    """Unverified Google email returns 401."""
    with _patch_google_client_id(), _patch_google_verify(MOCK_GOOGLE_UNVERIFIED):
        resp = await client.post("/api/v1/auth/google", json={
            "id_token": "fake-google-token",
        })
    assert resp.status_code == 401
    assert "not verified" in resp.json()["detail"].lower()


# ─── 17. health endpoint stays public ────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_stays_public(client: AsyncClient):
    """Health endpoint requires no auth."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
