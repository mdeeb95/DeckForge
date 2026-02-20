# Prompt: Post-Auth Improvements — 10 Fixes + CLAUDE.md Update

## Context
After completing auth-1-backend and auth-2-admin-panel, 10 improvements were identified covering bug fixes, security hardening, and admin panel features. Also update CLAUDE.md to always suggest improvements after completing tasks.

---

## Execution Order (quick wins first, then security, then features)

### Group 0: CLAUDE.md (~1 min)

**#10 — Add "suggest improvements" preference**
- **File:** `CLAUDE.md` line 72
- **Change:** Add to Preferences section:
  ```
  - After completing a task, always suggest 2–3 potential improvements or follow-up items
  ```

---

### Group 1: Quick Fixes (~10 min)

**#1 — Fix migration `sa.false_()` / `sa.true_()` bug**
- **Files:** `backend/alembic/versions/001_initial.py` (lines 37, 50, 60, 90), `backend/alembic/versions/002_google_auth_invite_codes.py` (lines 23, 24, 37)
- **Change:** Replace `sa.false_()` → `sa.text("false")`, `sa.true_()` → `sa.text("true")`
- **Why `sa.text()`:** Portable across SQLite + PostgreSQL. Generates raw `DEFAULT false`/`DEFAULT true`

**#5 — Remove unused `user_id` from PredictRequest**
- **File:** `backend/app/schemas/predict.py` line 10
- **Change:** Delete `user_id: str | None = None`. JWT auth provides identity now. Frontend doesn't send it.

**#2 — Create `requirements-dev.txt`**
- **File:** Create `backend/requirements-dev.txt`
- **Content:** `-r requirements.txt` + `pytest>=8.0.0`, `pytest-asyncio>=0.24.0`, `httpx>=0.28.0`

---

### Group 2: Security Hardening (~45 min)

**#6 — HTTPS-only admin cookie in production**
- **File:** `backend/app/admin/routes.py` line 58
- **Change:** Add `secure=is_production` to `set_cookie()`. Use `database_url.startswith("sqlite")` as dev/prod heuristic (already established in `main.py`)

**#3 — Rate-limit auth endpoints**
- **Files:** `backend/requirements.txt` (add `slowapi>=0.1.9`), `backend/app/main.py`, `backend/app/routes/auth.py`
- **Approach:** SlowAPI middleware on the FastAPI app
- **Key detail:** Auth routes use `request` as the Pydantic body name, but SlowAPI needs Starlette `Request`. Must rename Pydantic param from `request` → `body` in all 3 auth handlers + update all internal refs (`request.id_token` → `body.id_token`, etc.)
- **Limits:** `/auth/google` 10/min, `/auth/redeem-invite` 5/min, `/auth/refresh` 20/min
- **Tests:** Disable rate limiter in test conftest (set app state limiter to disabled or very high limit)

**#4 — Token revocation on refresh**
- **Files:** `backend/app/routes/auth.py`, `backend/app/auth/dependencies.py`, `backend/tests/conftest.py`
- **Auth.py change:** In `refresh` endpoint, revoke all existing `AuthToken` rows for the user before creating new ones (`UPDATE auth_tokens SET revoked=True WHERE user_id=X AND revoked=False`)
- **Dependencies.py change:** After finding user, query for non-revoked `AuthToken` matching the presented token hash. If no match → 401 "Token revoked"
- **Test risk:** Existing `make_access_token()` helper creates JWTs without DB rows. Need new `make_stored_access_token(user, db)` async helper that also creates an `AuthToken` record. Tests using middleware (11-14) must switch to it. JWT-level tests (expired token, missing header) stay as-is since they fail before the revocation check.

---

### Group 3: Admin Panel Features (~40 min)

**#7 — CSRF protection for admin panel**
- **Files:** `backend/app/admin/routes.py`, `backend/admin-ui/src/lib/api.ts`, `backend/tests/test_admin.py`
- **Approach:** Double-submit cookie pattern
  - Login: set `deckforge_csrf` cookie (NOT httponly, JS-readable) + return token in response
  - `_verify_admin()`: on POST/PUT/DELETE, check `X-CSRF-Token` header matches `deckforge_csrf` cookie
  - Admin UI `api.ts`: read CSRF cookie, send as `X-CSRF-Token` header on all POSTs
- **Tests:** Update `_login` helper to capture CSRF cookie, add header to all POST test requests

**#8 — Pagination on admin users/invites**
- **Files:** `backend/app/admin/routes.py`, `backend/admin-ui/src/lib/api.ts`, `Users.svelte`, `Invites.svelte`
- **Backend:** Add `page: int = 1, per_page: int = 50` query params. Return `{"items": [...], "total": N, "page": N, "pages": N}` instead of bare list
- **Frontend:** Update API types, add prev/next pagination buttons
- **Tests:** Update assertions from `isinstance(resp.json(), list)` to `resp.json()["items"]`

**#9 — Admin audit log**
- **Files:** `backend/app/db/models.py` (new `AdminAuditLog` model), `backend/alembic/versions/003_admin_audit_log.py` (new migration), `backend/app/admin/routes.py` (add `_audit()` helper)
- **Model:** `id, admin_email, action, target_type, target_id, details, created_at`
- **Called from:** `toggle_user_active`, `toggle_user_admin`, `generate_invites`, `toggle_invite_active`
- **No UI yet** — just backend logging. Admin UI view can be a follow-up task.

---

### Post-build: Rebuild admin SPA
- After Group 3 changes (CSRF + pagination touch `admin-ui/`), rebuild: `cd backend/admin-ui && npm run build`

---

## Verification
1. `cd backend && .venv/bin/python -m pytest tests/ -v` — all tests pass
2. `cd /Users/mdeeb95/Documents/DeckForge && npm run check` — 0 TypeScript errors
3. `.venv/bin/python -c "from app.main import app; print('OK')"` — server imports clean
4. Test alembic migrations work on fresh DB (from /tmp to avoid path shadowing)

## Key Risks
| Risk | Mitigation |
|------|-----------|
| Token revocation breaks test helpers | New `make_stored_access_token` fixture |
| Rate limiter triggers during tests | Disable in conftest |
| Pagination changes admin API response shape | Update frontend + tests simultaneously |
| CSRF adds header requirement to all admin POSTs | Update all test helpers at once |
