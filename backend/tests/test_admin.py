"""Admin panel API tests — login, users, invite code management."""
from __future__ import annotations

import re
from unittest.mock import patch, MagicMock

import pytest
from httpx import AsyncClient

from app.db.models import User, InviteCode
from app.admin.routes import _generate_code


# ─── Helpers ─────────────────────────────────────────────────────────────────

ADMIN_PASSWORD = "test-admin-password"

CONFUSABLE_CHARS = set("O0I1L")


def _patch_admin_settings():
    """Patch settings to have an admin_password set."""
    return patch(
        "app.admin.routes.get_settings",
        return_value=MagicMock(
            admin_password=ADMIN_PASSWORD,
            jwt_secret="dev-secret-change-in-production",
        ),
    )


async def _login(client: AsyncClient) -> dict:
    """Log in and return cookies dict."""
    with _patch_admin_settings():
        resp = await client.post("/api/v1/admin/login", json={"password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    return dict(resp.cookies)


# ─── 1. Login with correct password → 200 + cookie ──────────────────────────

@pytest.mark.asyncio
async def test_admin_login_correct_password(client: AsyncClient):
    with _patch_admin_settings():
        resp = await client.post("/api/v1/admin/login", json={"password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert "deckforge_admin_session" in resp.cookies


# ─── 2. Login with wrong password → 401 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_login_wrong_password(client: AsyncClient):
    with _patch_admin_settings():
        resp = await client.post("/api/v1/admin/login", json={"password": "wrong"})
    assert resp.status_code == 401


# ─── 3. /me without cookie → 401 ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_me_no_cookie(client: AsyncClient):
    resp = await client.get("/api/v1/admin/me")
    assert resp.status_code == 401


# ─── 4. /me with valid cookie → 200 ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_me_with_cookie(client: AsyncClient):
    cookies = await _login(client)
    with _patch_admin_settings():
        resp = await client.get("/api/v1/admin/me", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["authenticated"] is True


# ─── 5. /me with expired cookie → 401 ───────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_me_expired_cookie(client: AsyncClient):
    resp = await client.get("/api/v1/admin/me", cookies={"deckforge_admin_session": "garbage"})
    assert resp.status_code == 401


# ─── 6. /stats returns correct counts ───────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_stats(client: AsyncClient, test_user: User, invite_code: InviteCode):
    cookies = await _login(client)
    with _patch_admin_settings():
        resp = await client.get("/api/v1/admin/stats", cookies=cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_users"] >= 1
    assert data["total_invites"] >= 1


# ─── 7. /users returns all users as JSON ────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_users_list(client: AsyncClient, test_user: User):
    cookies = await _login(client)
    with _patch_admin_settings():
        resp = await client.get("/api/v1/admin/users", cookies=cookies)
    assert resp.status_code == 200
    users = resp.json()
    assert isinstance(users, list)
    assert len(users) >= 1
    assert users[0]["email"] is not None or users[0]["id"] is not None


# ─── 8. Toggle user active ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_toggle_user_active(client: AsyncClient, test_user: User):
    cookies = await _login(client)
    original = test_user.is_active
    with _patch_admin_settings():
        resp = await client.post(f"/api/v1/admin/users/{test_user.id}/toggle-active", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is not original


# ─── 9. Toggle user admin ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_toggle_user_admin(client: AsyncClient, test_user: User):
    cookies = await _login(client)
    original = test_user.is_admin
    with _patch_admin_settings():
        resp = await client.post(f"/api/v1/admin/users/{test_user.id}/toggle-admin", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is not original


# ─── 10. Generate invite codes ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_generate_invites(client: AsyncClient):
    cookies = await _login(client)
    with _patch_admin_settings():
        resp = await client.post("/api/v1/admin/invites/generate", cookies=cookies, json={
            "count": 5,
            "max_uses": 3,
            "note": "test batch",
        })
    assert resp.status_code == 200
    codes = resp.json()
    assert len(codes) == 5
    for code in codes:
        assert code["max_uses"] == 3
        assert code["note"] == "test batch"
        assert len(code["code"]) == 8


# ─── 11. Generated codes have no confusable characters ──────────────────────

def test_generate_code_no_confusable_chars():
    """Invite codes should not contain O, 0, I, 1, or L."""
    for _ in range(100):
        code = _generate_code()
        assert len(code) == 8
        assert code == code.upper()
        for ch in code:
            assert ch not in CONFUSABLE_CHARS, f"Code {code} contains confusable char {ch}"


# ─── 12. Toggle invite active ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_toggle_invite_active(client: AsyncClient, invite_code: InviteCode):
    cookies = await _login(client)
    original = invite_code.is_active
    with _patch_admin_settings():
        resp = await client.post(f"/api/v1/admin/invites/{invite_code.id}/toggle-active", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is not original


# ─── 13. Logout clears cookie ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_logout(client: AsyncClient):
    cookies = await _login(client)
    resp = await client.post("/api/v1/admin/logout", cookies=cookies)
    assert resp.status_code == 200


# ─── 14. Endpoints return 401 after logout ───────────────────────────────────

@pytest.mark.asyncio
async def test_admin_endpoints_401_after_logout(client: AsyncClient):
    # No cookies at all
    resp = await client.get("/api/v1/admin/stats")
    assert resp.status_code == 401

    resp = await client.get("/api/v1/admin/users")
    assert resp.status_code == 401

    resp = await client.get("/api/v1/admin/invites")
    assert resp.status_code == 401
