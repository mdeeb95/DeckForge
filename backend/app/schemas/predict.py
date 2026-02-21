from __future__ import annotations

from pydantic import BaseModel
from typing import Any


class PredictRequest(BaseModel):
    call_type: str  # level_2_feature, level_2_bug, level_2_tech_debt, level_3_plan, etc.
    context_payload: dict[str, Any]
    session_id: str | None = None
    preferences: dict[str, Any] | None = None

    # Level 3 plan-specific fields
    selected_label: str | None = None
    selected_rationale: str | None = None
    selected_scope: str | None = None
    category: str | None = None

    # Level 3 expand-specific fields
    original_plan: str | None = None
    depth: int | None = None

    # Modifier/reroll context
    rejected_features_list: list[str] | None = None
    current_errors: list[str] | None = None
    modifier_lens: str | None = None
    previously_shown_labels: list[str] | None = None


class Suggestion(BaseModel):
    label: str
    quip: str
    scope: str | None = None
    rationale: str | None = None
    symptom: str | None = None
    evidence: str | None = None


class Modifier(BaseModel):
    lens: str
    quip: str


class WildCard(BaseModel):
    label: str
    quip: str
    scope: str | None = None
    rationale: str | None = None
    symptom: str | None = None


class PlanStep(BaseModel):
    n: int
    text: str
    title: str | None = None
    description: str | None = None
    substeps: list[str] | None = None
    files_affected: list[str] | None = None
    risks: list[str] | None = None
    alternatives: list[str] | None = None
    what_could_go_wrong: str | None = None
    estimated_lines: int | None = None
    confidence_if_skipped: str | None = None


class PredictResponse(BaseModel):
    # Level 2 fields
    header_quip: str | None = None
    suggestions: list[Suggestion] | None = None
    modifier: Modifier | None = None
    wild_card: WildCard | None = None

    # Level 3 fields
    summary: str | None = None
    quip: str | None = None
    steps: list[PlanStep] | None = None
    scope: str | None = None
    confidence: str | None = None
    unhinged_modifier: str | None = None
    claude_code_intent: str | None = None

    # Level 3 expand fields
    commentary: str | None = None

    # Metadata
    call_type: str
    model_used: str
    latency_ms: int
    trace_id: str | None = None
    cache_hit: bool = False
    cost_usd: float | None = None
