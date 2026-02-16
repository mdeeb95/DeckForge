from __future__ import annotations

import json
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import PromptTemplate


async def get_active_template(
    db: AsyncSession,
    name: str,
    ab_test_group: str | None = None,
) -> str | None:
    """Load the active prompt template for a given call_type name."""
    stmt = (
        select(PromptTemplate.template_text)
        .where(
            PromptTemplate.name == name,
            PromptTemplate.is_active == True,
        )
    )

    if ab_test_group:
        stmt = stmt.where(PromptTemplate.ab_test_group == ab_test_group)
    else:
        stmt = stmt.where(PromptTemplate.ab_test_group.is_(None))

    stmt = stmt.order_by(PromptTemplate.version.desc()).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_all_active_templates(db: AsyncSession) -> list[dict]:
    """Return all active templates (for client caching)."""
    stmt = (
        select(PromptTemplate)
        .where(PromptTemplate.is_active == True)
        .order_by(PromptTemplate.name, PromptTemplate.version.desc())
    )
    result = await db.execute(stmt)
    templates = result.scalars().all()
    return [
        {
            "name": t.name,
            "version": t.version,
            "ab_test_group": t.ab_test_group,
        }
        for t in templates
    ]


def render_template(template_text: str, context: dict) -> str:
    """Render a template by injecting context into named slots.

    Slots use {slot_name} format. Context values are JSON-serialized
    if they are dicts/lists, otherwise converted to strings.
    """
    rendered = template_text

    for key, value in context.items():
        placeholder = "{" + key + "}"
        if placeholder in rendered:
            if isinstance(value, (dict, list)):
                rendered = rendered.replace(placeholder, json.dumps(value, indent=2))
            else:
                rendered = rendered.replace(placeholder, str(value))

    return rendered
