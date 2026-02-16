from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db
from app.db.models import PredictionCall
from app.schemas.predict import PredictRequest, PredictResponse, Suggestion, Modifier, WildCard, PlanStep
from app.prompts.templates import get_active_template, render_template
from app.llm.client import LLMClient, LLMResponse
from app.llm.models import get_model_for_call, estimate_cost
from app.llm.parser import parse_json_response, validate_level2_response, validate_plan_response

logger = logging.getLogger(__name__)
router = APIRouter()
llm_client = LLMClient()

# Map call_type to template name
CALL_TYPE_TO_TEMPLATE: dict[str, str] = {
    "level_2_feature": "level_2_feature",
    "level_2_bug": "level_2_bug",
    "level_2_tech_debt": "level_2_tech_debt",
    "level_3_plan": "level_3_plan",
    "level_3_expand": "level_3_expand",
    "exploration": "exploration",
    "qa_analysis": "qa_analysis",
    "deploy_preflight": "deploy_preflight",
    "empty_state": "empty_state",
}


@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: PredictRequest,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    call_type = request.call_type
    trace_id = str(uuid.uuid4())

    # 1. Load the prompt template
    template_name = CALL_TYPE_TO_TEMPLATE.get(call_type, call_type)
    template_text = await get_active_template(db, template_name)

    if template_text is None:
        # Fallback: use the template name as a basic prompt
        logger.warning(f"No template found for {template_name}, using fallback")
        template_text = f"Generate a response for call type: {call_type}\n\nContext:\n{{context_payload}}\n\nRespond in JSON only."

    # 2. Build template context
    template_context = {
        "context_payload": request.context_payload,
        "rejected_features_list": request.rejected_features_list or [],
        "current_errors": request.current_errors or [],
        "category": request.category or "Feature",
        "selected_label": request.selected_label or "",
        "selected_rationale": request.selected_rationale or "",
        "selected_scope": request.selected_scope or "",
        "modifier_lens": request.modifier_lens or "",
        "previously_shown_labels": request.previously_shown_labels or [],
    }

    # 3. Render the prompt
    prompt = render_template(template_text, template_context)

    # 4. Get model config
    provider = request.preferences.get("provider", settings.default_provider) if request.preferences else settings.default_provider
    model_override = request.preferences.get("model_override") if request.preferences else None
    model_config = get_model_for_call(call_type, provider, model_override)

    # 5. Call the LLM (with retry)
    try:
        llm_response = await llm_client.call_with_retry(prompt, model_config)
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        # Return mock/fallback response
        return _build_fallback_response(call_type, trace_id)

    # 6. Parse the response
    parsed = parse_json_response(llm_response.content)
    if parsed is None:
        logger.error(f"Failed to parse JSON from LLM response: {llm_response.content[:200]}")
        return _build_fallback_response(call_type, trace_id)

    # 7. Validate
    if call_type.startswith("level_2"):
        validation_errors = validate_level2_response(parsed, call_type)
        if validation_errors:
            logger.warning(f"Validation errors for {call_type}: {validation_errors}")
            # Non-fatal: still return the response, log warnings
    elif call_type == "level_3_plan":
        validation_errors = validate_plan_response(parsed)
        if validation_errors:
            logger.warning(f"Plan validation errors: {validation_errors}")

    # 8. Log to database
    cost_usd = estimate_cost(model_config.model_id, llm_response.input_tokens, llm_response.output_tokens)
    try:
        prediction_call = PredictionCall(
            user_id=uuid.UUID(request.user_id) if request.user_id else uuid.uuid4(),
            trace_id=trace_id,
            call_type=call_type,
            model_used=llm_response.model,
            input_tokens=llm_response.input_tokens,
            output_tokens=llm_response.output_tokens,
            cost_usd=cost_usd,
            latency_ms=llm_response.latency_ms,
            cache_hit=False,
        )
        db.add(prediction_call)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to log prediction call: {e}")
        await db.rollback()

    # 9. Log to Langfuse (best-effort)
    _log_to_langfuse(trace_id, call_type, prompt, llm_response, request)

    # 10. Build response
    return _build_response(parsed, call_type, llm_response, trace_id)


def _build_response(
    parsed: dict,
    call_type: str,
    llm_response: LLMResponse,
    trace_id: str,
) -> PredictResponse:
    """Convert parsed JSON into a typed PredictResponse."""
    response = PredictResponse(
        call_type=call_type,
        model_used=llm_response.model,
        latency_ms=llm_response.latency_ms,
        trace_id=trace_id,
    )

    # Level 2 fields
    if "header_quip" in parsed:
        response.header_quip = parsed["header_quip"]

    if "suggestions" in parsed:
        response.suggestions = [
            Suggestion(**s) for s in parsed["suggestions"]
        ]

    if "modifier" in parsed and isinstance(parsed["modifier"], dict):
        response.modifier = Modifier(**parsed["modifier"])

    if "wild_card" in parsed and isinstance(parsed["wild_card"], dict):
        response.wild_card = WildCard(**parsed["wild_card"])

    # Level 3 plan fields
    if "summary" in parsed:
        response.summary = parsed["summary"]
        response.quip = parsed.get("quip")
        response.scope = parsed.get("scope")
        response.confidence = parsed.get("confidence")
        response.unhinged_modifier = parsed.get("unhinged_modifier")
        response.claude_code_intent = parsed.get("claude_code_intent")

    if "steps" in parsed:
        response.steps = [PlanStep(**s) for s in parsed["steps"]]

    return response


def _build_fallback_response(call_type: str, trace_id: str) -> PredictResponse:
    """Return a hardcoded fallback response when LLM fails."""
    if call_type.startswith("level_2"):
        return PredictResponse(
            call_type=call_type,
            model_used="fallback",
            latency_ms=0,
            trace_id=trace_id,
            header_quip="my brain short-circuited. here are some backup ideas.",
            suggestions=[
                Suggestion(label="Improve UX", quip="make things smoother", scope="decent chunk", rationale="General improvement."),
                Suggestion(label="Add Tests", quip="future-proof the code", scope="decent chunk", rationale="Testing improves reliability."),
                Suggestion(label="Fix Edge Cases", quip="the corners need love too", scope="quick tweak", rationale="Edge cases cause bugs."),
                Suggestion(label="Better Error Handling", quip="fail gracefully", scope="quick tweak", rationale="Errors should be handled."),
                Suggestion(label="Performance Boost", quip="make it snappy", scope="decent chunk", rationale="Speed matters."),
                Suggestion(label="Accessibility Pass", quip="works for everyone", scope="decent chunk", rationale="A11y is important."),
                Suggestion(label="Update Dependencies", quip="security patches await", scope="quick tweak", rationale="Old deps have vulnerabilities."),
                Suggestion(label="Code Cleanup", quip="tidy up the mess", scope="decent chunk", rationale="Clean code is maintainable."),
            ],
            modifier=Modifier(lens="general improvement", quip="make it better"),
            wild_card=WildCard(label="Surprise Feature", quip="roll the dice", scope="decent chunk", rationale="Sometimes chaos works."),
        )
    else:
        return PredictResponse(
            call_type=call_type,
            model_used="fallback",
            latency_ms=0,
            trace_id=trace_id,
            summary="Execute the selected task",
            quip="let's get to work",
            steps=[
                PlanStep(n=1, text="Analyze the codebase"),
                PlanStep(n=2, text="Implement the changes"),
                PlanStep(n=3, text="Test the implementation"),
            ],
            scope="decent chunk",
            confidence="medium",
            unhinged_modifier="Go beyond the plan and add some flair.",
            claude_code_intent="Implement the selected task following existing patterns.",
        )


def _log_to_langfuse(
    trace_id: str,
    call_type: str,
    prompt: str,
    llm_response: LLMResponse,
    request: PredictRequest,
) -> None:
    """Best-effort logging to Langfuse."""
    settings = get_settings()
    if not settings.langfuse_secret_key:
        return

    try:
        from langfuse import Langfuse

        langfuse = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )

        trace = langfuse.trace(
            id=trace_id,
            name="prediction_call",
            user_id=request.user_id,
            metadata={
                "project_type": request.context_payload.get("project", {}).get("type_detected", "unknown"),
                "screen": call_type,
            },
        )

        trace.generation(
            name=call_type,
            model=llm_response.model,
            model_parameters={"temperature": 0.8},
            input=prompt,
            output=llm_response.content,
            usage={
                "input": llm_response.input_tokens,
                "output": llm_response.output_tokens,
                "total": llm_response.input_tokens + llm_response.output_tokens,
            },
            metadata={
                "call_type": call_type,
                "latency_ms": llm_response.latency_ms,
            },
        )

        langfuse.flush()
    except Exception as e:
        logger.warning(f"Langfuse logging failed: {e}")
