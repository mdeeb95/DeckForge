import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.rate_limit import limiter

from app.config import get_settings
from app.db.session import engine, AsyncSessionLocal
from app.db.models import Base
from app.prompts.seed import seed_prompt_templates
from app.routes import predict, feedback, templates, auth, claude_session
from app.admin.routes import router as admin_router
from app.llm.langfuse_logger import shutdown_langfuse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # Startup: create tables only for local SQLite dev (Alembic handles PostgreSQL)
    if settings.database_url.startswith("sqlite"):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("SQLite dev mode — created tables via create_all")

    # Seed prompt templates (safe for both dev and prod)
    async with AsyncSessionLocal() as db:
        count = await seed_prompt_templates(db)
        if count > 0:
            logger.info(f"Seeded {count} prompt templates")

    logger.info("DeckForge API started")
    yield

    # Shutdown
    shutdown_langfuse()
    await engine.dispose()
    logger.info("DeckForge API stopped")


app = FastAPI(
    title="DeckForge API",
    description="Prediction engine backend for DeckForge",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — configurable via ALLOWED_ORIGINS env var (comma-separated)
settings = get_settings()
origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(predict.router, prefix="/api/v1", tags=["predict"])
app.include_router(feedback.router, prefix="/api/v1", tags=["feedback"])
app.include_router(templates.router, prefix="/api/v1", tags=["templates"])
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(claude_session.router, prefix="/api/v1", tags=["claude_session"])
app.include_router(admin_router, prefix="/api/v1", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# Serve admin SPA static files (built Svelte app)
admin_dist = os.path.join(os.path.dirname(__file__), "..", "admin-ui", "dist")
if os.path.exists(admin_dist):
    app.mount("/admin", StaticFiles(directory=admin_dist, html=True), name="admin")
