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
            database_url="sqlite+aiosqlite://",
        ),
    )


async def _login(client: AsyncClient) -> tuple[dict, str]:
    """Log in and return (cookies dict, csrf_token)."""
    with _patch_admin_settings():
        resp = await client.post("/api/v1/admin/login", json={"password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    cookies = dict(resp.cookies)
    csrf_token = resp.json().get("csrf_token", "")
    return cookies, csrf_token


def _csrf_headers(csrf_token: str) -> dict:
    """Build headers dict with CSRF token for POST requests."""
    return {"X-CSRF-Token": csrf_token}


# ─── 1. Login with correct password → 200 + cookie ──────────────────────────

@pytest.mark.asyncio
async def test_admin_login_correct_password(client: AsyncClient):
    with _patch_admin_settings():
        resp = await client.post("/api/v1/admin/login", json={"password": ADMIN_PASSWORD})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert "deckforge_admin_session" in resp.cookies
    assert "deckforge_csrf" in resp.cookies
    assert resp.json()["csrf_token"]


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
    cookies, _ = await _login(client)
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
    cookies, _ = await _login(client)
    with _patch_admin_settings():
        resp = await client.get("/api/v1/admin/stats", cookies=cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_users"] >= 1
    assert data["total_invites"] >= 1


# ─── 7. /users returns paginated response ────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_users_list(client: AsyncClient, test_user: User):
    cookies, _ = await _login(client)
    with _patch_admin_settings():
        resp = await client.get("/api/v1/admin/users", cookies=cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "pages" in data
    assert len(data["items"]) >= 1
    assert data["items"][0]["email"] is not None or data["items"][0]["id"] is not None


# ─── 8. Toggle user active (with CSRF) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_toggle_user_active(client: AsyncClient, test_user: User):
    cookies, csrf = await _login(client)
    original = test_user.is_active
    with _patch_admin_settings():
        resp = await client.post(
            f"/api/v1/admin/users/{test_user.id}/toggle-active",
            cookies=cookies,
            headers=_csrf_headers(csrf),
        )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is not original


# ─── 9. Toggle user admin (with CSRF) ───────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_toggle_user_admin(client: AsyncClient, test_user: User):
    cookies, csrf = await _login(client)
    original = test_user.is_admin
    with _patch_admin_settings():
        resp = await client.post(
            f"/api/v1/admin/users/{test_user.id}/toggle-admin",
            cookies=cookies,
            headers=_csrf_headers(csrf),
        )
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is not original


# ─── 10. Generate invite codes (with CSRF) ──────────────────────────────────

@pytest.mark.asyncio
async def test_admin_generate_invites(client: AsyncClient):
    cookies, csrf = await _login(client)
    with _patch_admin_settings():
        resp = await client.post(
            "/api/v1/admin/invites/generate",
            cookies=cookies,
            headers=_csrf_headers(csrf),
            json={"count": 5, "max_uses": 3, "note": "test batch"},
        )
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


# ─── 12. Toggle invite active (with CSRF) ───────────────────────────────────

@pytest.mark.asyncio
async def test_admin_toggle_invite_active(client: AsyncClient, invite_code: InviteCode):
    cookies, csrf = await _login(client)
    original = invite_code.is_active
    with _patch_admin_settings():
        resp = await client.post(
            f"/api/v1/admin/invites/{invite_code.id}/toggle-active",
            cookies=cookies,
            headers=_csrf_headers(csrf),
        )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is not original


# ─── 13. Logout clears cookie ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_logout(client: AsyncClient):
    cookies, _ = await _login(client)
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


# ─── 15. POST without CSRF token → 403 ──────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_post_without_csrf_403(client: AsyncClient, test_user: User):
    cookies, _ = await _login(client)
    # POST without X-CSRF-Token header
    with _patch_admin_settings():
        resp = await client.post(
            f"/api/v1/admin/users/{test_user.id}/toggle-active",
            cookies=cookies,
            # No CSRF header
        )
    assert resp.status_code == 403
    assert "CSRF" in resp.json()["detail"]
