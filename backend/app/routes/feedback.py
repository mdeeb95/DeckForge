import logging

from fastapi import APIRouter, Depends

from app.schemas.feedback import FeedbackRequest, FeedbackResponse
from app.llm.langfuse_logger import log_feedback_scores
from app.auth.dependencies import get_current_user
from app.db.models import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    request: FeedbackRequest,
    user: User = Depends(get_current_user),
):
    """Log user feedback as Langfuse scores for RLHF."""
    reward = _compute_reward(request)

    # Log scores + event to Langfuse (best-effort)
    log_feedback_scores(
        trace_id=request.trace_id,
        user_action=request.user_action,
        computed_reward=reward,
        user_id=user.anonymized_id,
        selection_speed_ms=request.selection_speed_ms,
        selected_index=request.selected_index,
        reroll_count=request.reroll_count,
        plan_approved=request.plan_approved,
        plan_approval_button=request.plan_approval_button,
        used_unhinged_modifier=request.used_unhinged_modifier,
    )

    return FeedbackResponse(status="ok", computed_reward=reward)


def _compute_reward(request: FeedbackRequest) -> float:
    """Compute reward signal per prediction engine doc section 9.3."""
    reward = 0.0

    # Primary: user selected this suggestion (+0.5)
    if request.user_action == "selected":
        reward += 0.5
    elif request.user_action == "rerolled":
        reward -= 0.3
    elif request.user_action == "voice_escape":
        reward -= 0.4

    # Fast selection (<3s) +0.1
    if request.selection_speed_ms is not None and request.selection_speed_ms < 3000:
        reward += 0.1

    # No rerolls needed +0.1
    if request.reroll_count is not None and request.reroll_count == 0:
        reward += 0.1

    # Plan approved first try +0.15
    if request.plan_approved is True:
        reward += 0.15

    # Plan rejected -0.2
    if request.plan_approved is False:
        reward -= 0.2

    # Clamp to valid range
    return max(-0.4, min(1.0, reward))
