import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import engine, AsyncSessionLocal
from app.db.models import Base
from app.prompts.seed import seed_prompt_templates
from app.routes import predict, feedback, templates, auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and seed data
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        count = await seed_prompt_templates(db)
        if count > 0:
            logger.info(f"Seeded {count} prompt templates")

    logger.info("DeckForge API started")
    yield

    # Shutdown
    await engine.dispose()
    logger.info("DeckForge API stopped")


app = FastAPI(
    title="DeckForge API",
    description="Prediction engine backend for DeckForge",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for Tauri app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(predict.router, prefix="/api/v1", tags=["predict"])
app.include_router(feedback.router, prefix="/api/v1", tags=["feedback"])
app.include_router(templates.router, prefix="/api/v1", tags=["templates"])
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
