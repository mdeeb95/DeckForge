import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.llm.langfuse_logger import log_claude_session_trace
from app.auth.dependencies import get_current_user
from app.db.models import User

logger = logging.getLogger(__name__)
router = APIRouter()


class ClaudeSessionReport(BaseModel):
    session_id: str
    prompt: str
    result: str
    is_error: bool
    was_interrupted: bool
    was_unhinged: bool
    duration_ms: float
    duration_api_ms: float
    num_turns: int
    cost_usd: float
    total_cost_usd: float
    input_tokens: int
    output_tokens: int
    tools_used: list[str]
    files_affected: list[str]
    project_path: str
    prediction_trace_id: Optional[str] = None


@router.post("/claude-session")
async def report_claude_session(
    report: ClaudeSessionReport,
    user: User = Depends(get_current_user),
):
    """Log a Claude Code session trace to Langfuse."""
    log_claude_session_trace(report)
    return {"status": "ok"}
