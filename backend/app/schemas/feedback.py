from __future__ import annotations

from pydantic import BaseModel


class FeedbackRequest(BaseModel):
    trace_id: str
    user_action: str  # "selected", "rerolled", "rejected", "voice_escape"
    selection_speed_ms: int | None = None
    selected_index: int | None = None
    reroll_count: int | None = None
    plan_approved: bool | None = None
    plan_approval_button: str | None = None
    used_unhinged_modifier: bool | None = None


class FeedbackResponse(BaseModel):
    status: str
    computed_reward: float | None = None
