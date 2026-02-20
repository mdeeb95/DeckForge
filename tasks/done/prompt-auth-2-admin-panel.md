# Prompt: Admin Panel — Svelte SPA for User & Invite Code Management

## Prerequisites
**Run prompt-auth-1-backend.md first.** This prompt assumes the database migration (002) has been applied, `InviteCode` model exists, `User` model has `is_active`/`is_admin`/`email` fields, and auth middleware is in place.

## Context
DeckForge needs an admin panel so Mathew can manage users and generate invite codes without touching the database directly. We're building it as a **separate Svelte app** that shares DeckForge's design system (Tailwind config, color tokens, fonts, border-radius) and compiles to static files served by FastAPI.

**Why Svelte instead of Jinja2**: DeckForge is already a Svelte project. Reusing the same framework, Tailwind config, and design tokens means the admin panel looks and feels like it belongs. It also gives us reactivity for table filtering, copy-to-clipboard, and real-time UI updates without full page reloads.

**What we're building**: A Svelte SPA at `/admin` with password login, a dashboard, user management (toggle active/admin), and invite code generation/management.

---

## Section 1: Architecture

### How It Works

```
backend/admin-ui/          ← Separate Svelte + Vite project
  ├── src/
  │   ├── App.svelte        ← Root: router (login vs dashboard)
  │   ├── main.ts           ← Entry point
  │   ├── lib/
  │   │   ├── api.ts        ← Fetch wrapper for admin API endpoints
  │   │   ├── auth.ts       ← Admin session (password login, cookie check)
  │   │   └── components/
  │   │       ├── Dashboard.svelte
  │   │       ├── Users.svelte
  │   │       ├── Invites.svelte
  │   │       ├── Login.svelte
  │   │       ├── Nav.svelte
  │   │       ├── StatCard.svelte
  │   │       └── StatusBadge.svelte
  │   └── app.css           ← Tailwind imports
  ├── index.html
  ├── vite.config.ts        ← base: '/admin/'
  ├── svelte.config.js
  ├── tailwind.config.js    ← Copy from root, adjust content paths
  ├── postcss.config.js
  ├── tsconfig.json
  └── package.json

↓ npm run build ↓

backend/admin-ui/dist/     ← Static HTML/JS/CSS
  ├── index.html
  └── assets/
      ├── index-[hash].js
      └── index-[hash].css

↓ FastAPI serves ↓

GET /admin → StaticFiles(directory="admin-ui/dist")
```

### Key Design Decisions
- **Separate `package.json`** — the admin panel has its own deps, doesn't bloat DeckForge's Tauri build
- **Shared Tailwind config** — copy the root `tailwind.config.js` and adjust `content` paths. Same colors, fonts, border-radius
- **Built static files committed to repo** — so Railway serves them without needing a Node build step in the Docker image. Run `npm run build` before committing
- **SPA with hash routing** — `#/dashboard`, `#/users`, `#/invites`. No server-side routing needed
- **API calls use relative paths** — the SPA is served from the same origin as FastAPI, so `fetch('/api/v1/admin/...')` just works

---

## Section 2: Backend API Endpoints

The admin panel needs dedicated API endpoints (JSON, not HTML). Add these to the FastAPI backend.

### 2.1 Create `backend/app/admin/__init__.py`

Empty file.

### 2.2 Create `backend/app/admin/routes.py`

These are **JSON API endpoints** under `/api/v1/admin/`, NOT server-rendered HTML. They're protected by admin password via a signed cookie.

```python
"""Admin panel API routes — JSON endpoints for the Svelte admin SPA."""
from __future__ import annotations

import secrets
import string
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
```

### 2.3 Add Config

Add to the `Settings` class in `backend/app/config.py`:

```python
# Admin panel
admin_password: str = ""            # Simple password for admin panel login (env var only)
```

### 2.4 Add Dependency

Add to `backend/requirements.txt`:
```
itsdangerous>=2.2.0
```

### 2.5 Mount in `backend/app/main.py`

```python
from app.admin.routes import router as admin_router
from fastapi.staticfiles import StaticFiles
import os

# Admin API routes
app.include_router(admin_router, prefix="/api/v1", tags=["admin"])

# Serve admin SPA static files (built Svelte app)
admin_dist = os.path.join(os.path.dirname(__file__), "..", "admin-ui", "dist")
if os.path.exists(admin_dist):
    app.mount("/admin", StaticFiles(directory=admin_dist, html=True), name="admin")
```

The `html=True` flag tells FastAPI to serve `index.html` for any path under `/admin`, which is what an SPA needs for client-side routing.

---

## Section 3: Svelte Admin SPA

### 3.1 Scaffold the Project

Create `backend/admin-ui/` as a new Svelte + Vite project:

```bash
cd backend
npm create vite@latest admin-ui -- --template svelte-ts
cd admin-ui
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 3.2 `tailwind.config.js`

Copy from root DeckForge `tailwind.config.js` but change the `content` paths:

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{svelte,js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#0df2f2",
        "primary-dim": "#089090",
        "secondary": "#f20dcf",
        "background-light": "#f5f8f8",
        "background-dark": "#0d1117",
        "surface-dark": "#161b22",
        "surface-border": "#30363d",
      },
      fontFamily: {
        "display": ["Space Grotesk", "sans-serif"],
        "mono": ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "9999px"
      },
    },
  },
  plugins: [],
}
```

### 3.3 `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: '/admin/',  // Critical: SPA is served under /admin/
});
```

### 3.4 `src/app.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Import DeckForge fonts if available via CDN */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

### 3.5 `src/lib/api.ts`

Fetch wrapper for all admin API calls. Handles the session cookie automatically (cookies are sent with same-origin requests):

```typescript
const BASE = '/api/v1/admin';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',  // send cookies
    headers: { 'Content-Type': 'application/json', ...options.headers as any },
    ...options,
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    window.location.hash = '#/login';
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export const adminApi = {
  // Auth
  login: (password: string) => api('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => api('/logout', { method: 'POST' }),
  checkSession: () => api<{ authenticated: boolean }>('/me'),

  // Dashboard
  getStats: () => api<{ total_users: number; active_users: number; total_invites: number; total_predictions: number }>('/stats'),
  getRecentUsers: () => api<UserData[]>('/recent-users'),

  // Users
  getUsers: () => api<UserData[]>('/users'),
  toggleActive: (id: string) => api<UserData>(`/users/${id}/toggle-active`, { method: 'POST' }),
  toggleAdmin: (id: string) => api<UserData>(`/users/${id}/toggle-admin`, { method: 'POST' }),

  // Invites
  getInvites: () => api<InviteData[]>('/invites'),
  generateInvites: (count: number, maxUses: number, note: string) =>
    api<InviteData[]>('/invites/generate', {
      method: 'POST',
      body: JSON.stringify({ count, max_uses: maxUses, note }),
    }),
  toggleInviteActive: (id: string) => api<InviteData>(`/invites/${id}/toggle-active`, { method: 'POST' }),
};

export interface UserData {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_admin: boolean;
  invite_code_used: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  app_version: string | null;
}

export interface InviteData {
  id: string;
  code: string;
  max_uses: number;
  times_used: number;
  is_active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string | null;
}
```

### 3.6 Components

Build these Svelte components. All use Tailwind classes matching DeckForge's design system.

**`App.svelte`** — Root component with hash-based routing:
- On mount: call `adminApi.checkSession()` to verify cookie
- If authenticated → show Nav + routed content
- If not → show Login
- Routes: `#/dashboard` (default), `#/users`, `#/invites`
- Use `window.addEventListener('hashchange', ...)` for routing — no need for a router library

**`Nav.svelte`** — Top navigation bar:
- Left: "DECKFORGE ADMIN" in Space Grotesk, white, with cyan underline or accent
- Center/Right: Dashboard | Users | Invites links
- Far right: Logout button
- Active link: cyan text. Inactive: `#8b949e` muted text
- Background: `#161b22` surface, bottom border `#30363d`

**`Login.svelte`** — Password login:
- Centered card on `#0d1117` background
- Title: "DeckForge Admin" in display font
- Password input with surface-dark background, surface-border border
- Submit button: cyan background, dark text
- Error message in red below button
- Calls `adminApi.login(password)` → dispatches `authenticated` event on success

**`Dashboard.svelte`** — Stats + recent users:
- Four `StatCard` components in a flex row (wrap on narrow screens)
- Below: "Recent Activity" header + table of recent users
- Load data with `adminApi.getStats()` and `adminApi.getRecentUsers()` on mount
- Show loading spinner while fetching

**`StatCard.svelte`** — Reusable stat display:
- Props: `label: string`, `value: number`, `icon?: string`
- Surface background, border
- Large cyan number, muted label below

**`Users.svelte`** — User management table:
- Load with `adminApi.getUsers()` on mount
- Table columns: Email, Display Name, Created, Last Seen, Status, Admin, Invite Code, Actions
- Status: `StatusBadge` component (green "Active" / red "Inactive")
- Admin: cyan "Admin" badge or empty
- Actions: two small buttons per row — "Deactivate"/"Activate" and "Remove Admin"/"Make Admin"
- Buttons call `adminApi.toggleActive(id)` / `adminApi.toggleAdmin(id)` then reactively update the row (no full page reload)
- Invite code column: monospace font

**`Invites.svelte`** — Invite code management:
- Top: "Generate Codes" card with form inputs (Count, Max Uses, Note) and Generate button
- On generate: call `adminApi.generateInvites(...)`, prepend results to table
- Below: table of all invite codes
- Code column: **large JetBrains Mono text** with a copy button (small clipboard icon). On click: `navigator.clipboard.writeText(code)` with brief "Copied!" feedback
- Status: `StatusBadge` with logic:
  - `!is_active` → gray "Disabled"
  - `times_used >= max_uses` → yellow "Depleted"
  - `expires_at` past → red "Expired"
  - else → green "Active"
- Action: Toggle Active button

**`StatusBadge.svelte`** — Reusable badge:
- Props: `status: 'active' | 'inactive' | 'depleted' | 'expired' | 'disabled'`
- Color mapping: active→green, inactive→red, depleted→yellow, expired→red, disabled→gray
- Small pill shape, uppercase text, subtle background tint

### 3.7 Design Rules

These must be followed exactly to match DeckForge:

- Background: `bg-background-dark` (`#0d1117`)
- Cards/surfaces: `bg-surface-dark` (`#161b22`)
- Borders: `border-surface-border` (`#30363d`)
- Primary accent: `text-primary` (`#0df2f2`) — used for numbers, active states, primary buttons
- Text: white (`text-white`) for primary, `text-gray-400` for muted
- Font: `font-display` for headings, `font-mono` for codes
- Border radius: `rounded` (0.125rem default, matching root config)
- No scroll on individual pages if possible — but OK if user list is long (this isn't the Steam Deck)
- Responsive: works on desktop browser and phone (for Mathew checking things on the go)
- Dark class: add `class="dark"` to `<html>` in `index.html`

### 3.8 Build Script

Add to `backend/admin-ui/package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

After building (`npm run build`), the `dist/` folder contains static files that FastAPI serves. **Commit the `dist/` folder** so Railway doesn't need Node.js to build it.

Add `backend/admin-ui/node_modules/` to `.gitignore` but NOT `backend/admin-ui/dist/`.

---

## Section 4: Testing

### 4.1 Backend API Tests — `backend/tests/test_admin.py`

```python
# Test cases:
# 1. POST /api/v1/admin/login with correct password → 200, sets cookie
# 2. POST /api/v1/admin/login with wrong password → 401
# 3. GET /api/v1/admin/me without cookie → 401
# 4. GET /api/v1/admin/me with valid cookie → 200
# 5. GET /api/v1/admin/me with expired cookie → 401
# 6. GET /api/v1/admin/stats → returns correct counts
# 7. GET /api/v1/admin/users → returns all users as JSON
# 8. POST /api/v1/admin/users/{id}/toggle-active → flips is_active, returns updated user
# 9. POST /api/v1/admin/users/{id}/toggle-admin → flips is_admin, returns updated user
# 10. POST /api/v1/admin/invites/generate with count=5 → creates 5 codes
# 11. Generated codes are 8 chars, uppercase, no confusable characters (O/0/I/1/L)
# 12. POST /api/v1/admin/invites/{id}/toggle-active → flips is_active
# 13. POST /api/v1/admin/logout → clears cookie
# 14. All endpoints return 401 after logout
```

### 4.2 Manual Verification

After building the Svelte SPA:
1. Run `cd backend/admin-ui && npm run build`
2. Run `cd backend && uvicorn app.main:app`
3. Open `http://localhost:8000/admin` in browser
4. Should see login page
5. Enter password → should see dashboard with stats
6. Navigate to Users and Invites pages
7. Generate an invite code, verify copy-to-clipboard works
8. Toggle a user active/inactive, verify badge updates without page reload

---

## Section 5: Verification Checklist

1. `backend/admin-ui/` scaffolded with Svelte + Vite + Tailwind
2. Tailwind config matches DeckForge colors/fonts/radii exactly
3. `npm run build` produces `dist/` with `index.html` and assets
4. FastAPI serves the SPA at `/admin` and falls back to `index.html` for all sub-paths
5. Admin API endpoints all return JSON (not HTML)
6. Login sets httpOnly cookie, logout clears it
7. All API endpoints return 401 without valid cookie
8. Dashboard shows correct stats
9. Users table has working toggle buttons (reactive, no reload)
10. Invite generation creates codes with no confusable characters
11. Copy-to-clipboard works on invite codes
12. `pytest backend/tests/test_admin.py` passes
13. Dark theme matches DeckForge aesthetic

---

## File Change Summary

### New Files
```
backend/admin-ui/                    ← Entire Svelte project
  package.json
  vite.config.ts
  svelte.config.js
  tailwind.config.js
  postcss.config.js
  tsconfig.json
  index.html
  src/main.ts
  src/app.css
  src/App.svelte
  src/lib/api.ts
  src/lib/components/Dashboard.svelte
  src/lib/components/Users.svelte
  src/lib/components/Invites.svelte
  src/lib/components/Login.svelte
  src/lib/components/Nav.svelte
  src/lib/components/StatCard.svelte
  src/lib/components/StatusBadge.svelte
  dist/                              ← Built output (committed)
backend/app/admin/__init__.py
backend/app/admin/routes.py
backend/tests/test_admin.py
```

### Modified Files
```
backend/app/config.py          — Add admin_password setting
backend/app/main.py            — Mount admin API routes + serve SPA static files
backend/requirements.txt       — Add itsdangerous
.gitignore                     — Add backend/admin-ui/node_modules/
```
