import logging

from fastapi import APIRouter

from app.config import get_settings
from app.schemas.feedback import FeedbackRequest, FeedbackResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(request: FeedbackRequest):
    """Log user feedback as a Langfuse score for RLHF."""
    reward = _compute_reward(request)

    # Log to Langfuse
    settings = get_settings()
    if settings.langfuse_secret_key:
        try:
            from langfuse import Langfuse

            langfuse = Langfuse(
                public_key=settings.langfuse_public_key,
                secret_key=settings.langfuse_secret_key,
                host=settings.langfuse_host,
            )

            # Score: user_selection
            langfuse.score(
                trace_id=request.trace_id,
                name="user_selection",
                value=1.0 if request.user_action == "selected" else 0.0,
                data_type="NUMERIC",
            )

            # Score: computed_reward
            langfuse.score(
                trace_id=request.trace_id,
                name="computed_reward",
                value=reward,
                data_type="NUMERIC",
            )

            # Score: selection_speed
            if request.selection_speed_ms is not None:
                langfuse.score(
                    trace_id=request.trace_id,
                    name="selection_speed",
                    value=float(request.selection_speed_ms),
                    data_type="NUMERIC",
                )

            # Event: user_action details
            langfuse.event(
                trace_id=request.trace_id,
                name="user_action",
                metadata={
                    "action": request.user_action,
                    "selected_index": request.selected_index,
                    "reroll_count": request.reroll_count,
                    "selection_speed_ms": request.selection_speed_ms,
                    "plan_approved": request.plan_approved,
                    "plan_approval_button": request.plan_approval_button,
                    "used_unhinged_modifier": request.used_unhinged_modifier,
                },
            )

            langfuse.flush()
        except Exception as e:
            logger.warning(f"Langfuse feedback logging failed: {e}")

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
