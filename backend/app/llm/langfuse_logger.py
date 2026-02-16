"""Centralized Langfuse observability — traces, generations, scores, events."""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

# ─── Singleton client ────────────────────────────────────────────────────────

_langfuse_client = None


def _get_langfuse():
    """Get or create the Langfuse client (lazy singleton)."""
    global _langfuse_client
    if _langfuse_client is not None:
        return _langfuse_client

    settings = get_settings()
    if not settings.langfuse_secret_key:
        return None

    try:
        from langfuse import Langfuse

        # Set env vars so get_client() also works if needed
        os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
        if settings.langfuse_host:
            os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)

        _langfuse_client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host or "https://cloud.langfuse.com",
        )
        logger.info("Langfuse client initialized")
        return _langfuse_client
    except Exception as e:
        logger.warning(f"Failed to initialize Langfuse: {e}")
        return None


def _context_hash(prompt: str) -> str:
    """Short hash of the prompt for deduplication / cache correlation."""
    return hashlib.sha256(prompt.encode()).hexdigest()[:12]


# ─── Prediction call tracing ─────────────────────────────────────────────────


def log_prediction_trace(
    trace_id: str,
    call_type: str,
    prompt: str,
    llm_response: Any,
    request: Any,
    cache_hit: bool = False,
) -> None:
    """Log a full prediction call as a Langfuse trace + generation.

    Creates:
      - A trace with name, user_id, session_id, metadata
      - A generation nested under the trace with model, input, output, usage, metadata
    """
    langfuse = _get_langfuse()
    if langfuse is None:
        return

    try:
        # Extract metadata from request
        context = request.context_payload or {}
        project_info = context.get("project", {})
        session_info = context.get("session", {})

        user_id = request.user_id or "anonymous"
        session_id = request.session_id if hasattr(request, "session_id") and request.session_id else None

        # 1. Create the trace
        trace = langfuse.trace(
            id=trace_id,
            name="prediction_call",
            user_id=user_id,
            session_id=session_id,
            input={"call_type": call_type},
            output={"model": llm_response.model, "latency_ms": llm_response.latency_ms},
            metadata={
                "project_type": project_info.get("type_detected", "unknown"),
                "session_number": session_info.get("session_number", 0),
                "screen": call_type,
            },
        )

        # 2. Create a generation nested under the trace
        trace.generation(
            name=call_type,
            model=llm_response.model,
            input=prompt,
            output=llm_response.content,
            usage={
                "input": llm_response.input_tokens,
                "output": llm_response.output_tokens,
                "total": llm_response.input_tokens + llm_response.output_tokens,
            },
            metadata={
                "call_type": call_type,
                "context_hash": _context_hash(prompt),
                "latency_ms": llm_response.latency_ms,
                "cache_hit": cache_hit,
            },
        )

        langfuse.flush()
        logger.info(f"Langfuse trace logged for {call_type} (trace_id={trace_id})")
    except Exception as e:
        logger.warning(f"Langfuse prediction logging failed: {e}", exc_info=True)


# ─── Feedback scoring ────────────────────────────────────────────────────────


def log_feedback_scores(
    trace_id: str,
    user_action: str,
    computed_reward: float,
    selection_speed_ms: int | None = None,
    selected_index: int | None = None,
    reroll_count: int | None = None,
    plan_approved: bool | None = None,
    plan_approval_button: str | None = None,
    used_unhinged_modifier: bool | None = None,
) -> None:
    """Log user feedback as Langfuse scores + event on the existing trace.

    Scores:
      - user_selection: 1.0 if selected, 0.0 otherwise
      - computed_reward: composite score from section 9.3
      - selection_speed: milliseconds to select (if provided)

    Event:
      - user_action: full metadata of the user interaction
    """
    langfuse = _get_langfuse()
    if langfuse is None:
        return

    try:
        # Score: user_selection
        langfuse.score(
            trace_id=trace_id,
            name="user_selection",
            value=1.0 if user_action == "selected" else 0.0,
            data_type="NUMERIC",
        )

        # Score: computed_reward
        langfuse.score(
            trace_id=trace_id,
            name="computed_reward",
            value=computed_reward,
            data_type="NUMERIC",
        )

        # Score: selection_speed
        if selection_speed_ms is not None:
            langfuse.score(
                trace_id=trace_id,
                name="selection_speed",
                value=float(selection_speed_ms),
                data_type="NUMERIC",
            )

        # Event: detailed user action metadata
        langfuse.event(
            trace_id=trace_id,
            name="user_action",
            metadata={
                "action": user_action,
                "selected_index": selected_index,
                "reroll_count": reroll_count,
                "selection_speed_ms": selection_speed_ms,
                "plan_approved": plan_approved,
                "plan_approval_button": plan_approval_button,
                "used_unhinged_modifier": used_unhinged_modifier,
            },
        )

        langfuse.flush()
        logger.info(f"Langfuse feedback logged for trace_id={trace_id}")
    except Exception as e:
        logger.warning(f"Langfuse feedback logging failed: {e}", exc_info=True)


# ─── Shutdown ─────────────────────────────────────────────────────────────────


def shutdown_langfuse() -> None:
    """Flush and shutdown the Langfuse client. Call on app shutdown."""
    global _langfuse_client
    if _langfuse_client is not None:
        try:
            _langfuse_client.flush()
            _langfuse_client.shutdown()
            logger.info("Langfuse client shut down")
        except Exception as e:
            logger.warning(f"Langfuse shutdown error: {e}")
        _langfuse_client = None
