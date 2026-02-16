from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.prompts.templates import get_all_active_templates

router = APIRouter()


@router.get("/templates")
async def list_templates(db: AsyncSession = Depends(get_db)):
    """Return all active prompt templates (for client-side caching)."""
    templates = await get_all_active_templates(db)
    return {"templates": templates}
