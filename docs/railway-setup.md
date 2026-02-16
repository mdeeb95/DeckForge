# Railway Backend Setup

## Project Info

| Field | Value |
|-------|-------|
| Project URL | https://railway.com/project/6865c1d2-fffc-4961-89a1-e00f986f2a59 |
| Backend Service | `deckforge-api-production.up.railway.app` |
| Health Check | `GET /health` |

## Architecture

```
Railway Project
├── deckforge-api (FastAPI backend)
│   ├── Dockerfile builder
│   ├── Release command: alembic upgrade head
│   └── Start command: uvicorn app.main:app
├── PostgreSQL (managed by Railway)
│   └── Auto-injects $DATABASE_URL when linked
└── Langfuse (optional, Docker image)
    └── langfuse/langfuse:2
```

## Environment Variables

### Auto-injected by Railway

| Variable | Source |
|----------|--------|
| `PORT` | Railway runtime (do NOT set manually) |
| `DATABASE_URL` | PostgreSQL service (auto-linked) |

### Must be set manually

| Variable | Notes |
|----------|-------|
| `ANTHROPIC_API_KEY` | Required for Claude predictions |
| `JWT_SECRET` | Strong random value for token signing |
| `ALLOWED_ORIGINS` | `tauri://localhost` + any web domains |
| `LANGFUSE_SECRET_KEY` | From Langfuse project settings |
| `LANGFUSE_PUBLIC_KEY` | From Langfuse project settings |
| `LANGFUSE_HOST` | URL of self-hosted Langfuse on Railway |

## Deploy

### Via script

```bash
./scripts/deploy-backend.sh
```

### Via Railway CLI

```bash
cd backend
railway up
```

### Via GitHub (auto-deploy)

Push to `main` — Railway watches the repo and auto-deploys on push.

## Database Migrations

Migrations run automatically on every deploy via the `releaseCommand` in `railway.toml`:

```toml
[deploy]
releaseCommand = "alembic upgrade head"
```

To create a new migration locally:

```bash
cd backend
alembic revision --autogenerate -m "description"
```

## Adding Langfuse Service

1. In the Railway dashboard, click **New Service**
2. Select **Docker Image** → `langfuse/langfuse:2`
3. Add these environment variables to the Langfuse service:
   - `DATABASE_URL` — link to the same PostgreSQL, or a separate one
   - `NEXTAUTH_SECRET` — random string
   - `NEXTAUTH_URL` — the public URL Railway assigns
   - `SALT` — random string
4. After Langfuse is running, create a project and copy the API keys
5. Set `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_HOST` on the backend service

## Connecting PostgreSQL

1. In the Railway dashboard, click **New Service** → **Database** → **PostgreSQL**
2. Click on the backend service → **Variables** → **Reference**
3. Select the PostgreSQL service — Railway auto-injects `$DATABASE_URL`
4. The backend's `config.py` converts `postgresql://` to `postgresql+asyncpg://` automatically

## Local Development

For local dev, the backend defaults to SQLite (no database setup needed):

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Override with a local PostgreSQL by setting `DATABASE_URL` in `backend/.env`.
