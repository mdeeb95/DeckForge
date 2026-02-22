"""Centralized Langfuse observability — traces, generations, scores, events.

Written against the Langfuse Python SDK v3 API (OpenTelemetry-based).
Uses context managers (start_as_current_observation), propagate_attributes
for trace-level identity, and create_score for scoring.
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

# ─── Lazy import: propagate_attributes ───────────────────────────────────────
# Imported at module level so tests can patch it easily.

try:
    from langfuse import propagate_attributes
except ImportError:
    from contextlib import contextmanager

    @contextmanager
    def propagate_attributes(**kwargs):
        yield


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


def _to_trace_hex(trace_id: str) -> str:
    """Convert a trace ID to a 32-char hex string for OTel trace context.

    UUIDs have dashes stripped.  Non-hex strings are SHA-256 hashed.
    """
    hex_id = trace_id.replace("-", "")
    if len(hex_id) == 32 and all(c in "0123456789abcdef" for c in hex_id):
        return hex_id
    return hashlib.sha256(trace_id.encode()).hexdigest()[:32]


def _stringify_metadata(metadata: dict) -> dict[str, str]:
    """Coerce all metadata values to strings for OTel compatibility."""
    return {k: str(v) for k, v in metadata.items() if v is not None}


# ─── Prediction call tracing ─────────────────────────────────────────────────


def log_prediction_trace(
    trace_id: str,
    call_type: str,
    prompt: str,
    llm_response: Any,
    request: Any,
    user_id: str,
    session_id: str | None = None,
    cache_hit: bool = False,
) -> None:
    """Log a full prediction call as a Langfuse trace + generation.

    Creates:
      - A root span with name, user_id, session_id, metadata
      - A generation nested under the span with model, input, output, usage
    """
    langfuse = _get_langfuse()
    if langfuse is None:
        return

    try:
        context = request.context_payload or {}
        project_info = context.get("project", {})
        session_info = context.get("session", {})
        trace_id_hex = _to_trace_hex(trace_id)

        with langfuse.start_as_current_observation(
            as_type="span",
            name="prediction_call",
            trace_context={"trace_id": trace_id_hex},
            input={"call_type": call_type},
        ) as root_span:
            with propagate_attributes(
                user_id=user_id,
                session_id=session_id,
                metadata=_stringify_metadata({
                    "project_type": project_info.get("type_detected", "unknown"),
                    "session_number": session_info.get("session_number", 0),
                    "screen": call_type,
                }),
            ):
                with langfuse.start_as_current_observation(
                    as_type="generation",
                    name=call_type,
                    model=llm_response.model,
                ) as gen:
                    gen.update(
                        input=prompt,
                        output=llm_response.content,
                        usage_details={
                            "input": llm_response.input_tokens,
                            "output": llm_response.output_tokens,
                            "total": llm_response.input_tokens + llm_response.output_tokens,
                        },
                        metadata=_stringify_metadata({
                            "call_type": call_type,
                            "context_hash": _context_hash(prompt),
                            "latency_ms": llm_response.latency_ms,
                            "cache_hit": cache_hit,
                        }),
                    )

            root_span.update_trace(
                output={"model": llm_response.model, "latency_ms": llm_response.latency_ms},
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
    user_id: str | None = None,
    selection_speed_ms: int | None = None,
    selected_index: int | None = None,
    reroll_count: int | None = None,
    plan_approved: bool | None = None,
    plan_approval_button: str | None = None,
    used_unhinged_modifier: bool | None = None,
) -> None:
    """Log user feedback as Langfuse scores on the existing trace.

    Scores:
      - user_selection: 1.0 if selected, 0.0 otherwise
      - computed_reward: composite score from section 9.3
      - selection_speed: milliseconds to select (if provided)

    Also creates a span with detailed action metadata (v3 replacement for
    the v2 event() call).
    """
    langfuse = _get_langfuse()
    if langfuse is None:
        return

    try:
        trace_id_hex = _to_trace_hex(trace_id)

        # Score: user_selection
        langfuse.create_score(
            trace_id=trace_id_hex,
            name="user_selection",
            value=1.0 if user_action == "selected" else 0.0,
            data_type="NUMERIC",
        )

        # Score: computed_reward
        langfuse.create_score(
            trace_id=trace_id_hex,
            name="computed_reward",
            value=computed_reward,
            data_type="NUMERIC",
        )

        # Score: selection_speed
        if selection_speed_ms is not None:
            langfuse.create_score(
                trace_id=trace_id_hex,
                name="selection_speed",
                value=float(selection_speed_ms),
                data_type="NUMERIC",
            )

        # Detailed user action metadata (span replaces v2 event)
        event_metadata = {
            "action": user_action,
            "selected_index": selected_index,
            "reroll_count": reroll_count,
            "selection_speed_ms": selection_speed_ms,
            "plan_approved": plan_approved,
            "plan_approval_button": plan_approval_button,
            "used_unhinged_modifier": used_unhinged_modifier,
        }
        if user_id:
            event_metadata["user_id"] = user_id

        with langfuse.start_as_current_observation(
            as_type="span",
            name="user_action",
            trace_context={"trace_id": trace_id_hex},
        ) as span:
            span.update(metadata=_stringify_metadata(event_metadata))

        langfuse.flush()
        logger.info(f"Langfuse feedback logged for trace_id={trace_id}")
    except Exception as e:
        logger.warning(f"Langfuse feedback logging failed: {e}", exc_info=True)


# ─── Claude Code session tracing ─────────────────────────────────────────────


def log_claude_session_trace(report: Any, user_id: str, session_id: str | None = None) -> None:
    """Log a Claude Code session as a Langfuse trace with scores.

    Creates:
      - A root span named 'claude_code_session' with prompt/result/metadata
      - Scores: session_cost_usd, session_duration_ms, session_outcome, total_tokens
    """
    langfuse = _get_langfuse()
    if langfuse is None:
        return

    try:
        # Determine outcome score: 1.0 = success, 0.5 = interrupted, 0.0 = error
        if report.was_interrupted:
            outcome = 0.5
        elif report.is_error:
            outcome = 0.0
        else:
            outcome = 1.0

        pred_trace_id = report.prediction_trace_id or _context_hash(report.prompt)
        compound_id = f"session-{report.session_id}-{pred_trace_id}"
        trace_id_hex = hashlib.sha256(compound_id.encode()).hexdigest()[:32]
        effective_session_id = session_id or report.session_id

        with langfuse.start_as_current_observation(
            as_type="span",
            name="claude_code_session",
            trace_context={"trace_id": trace_id_hex},
            input=report.prompt[:500],
        ) as root_span:
            with propagate_attributes(
                user_id=user_id,
                session_id=effective_session_id,
                metadata=_stringify_metadata({
                    "was_unhinged": report.was_unhinged,
                    "num_turns": report.num_turns,
                    "tools_used": report.tools_used[:20],
                    "files_affected": report.files_affected[:20],
                    "project_path": report.project_path,
                    "prediction_trace_id": report.prediction_trace_id,
                }),
            ):
                root_span.update(
                    output={
                        "result": report.result[:500] if report.result else "",
                        "is_error": report.is_error,
                        "was_interrupted": report.was_interrupted,
                    },
                )

        # Attach scores to the trace
        langfuse.create_score(
            trace_id=trace_id_hex, name="session_cost_usd",
            value=report.cost_usd, data_type="NUMERIC",
        )
        langfuse.create_score(
            trace_id=trace_id_hex, name="session_duration_ms",
            value=report.duration_ms, data_type="NUMERIC",
        )
        langfuse.create_score(
            trace_id=trace_id_hex, name="session_outcome",
            value=outcome, data_type="NUMERIC",
        )
        langfuse.create_score(
            trace_id=trace_id_hex, name="total_tokens",
            value=float(report.input_tokens + report.output_tokens),
            data_type="NUMERIC",
        )

        langfuse.flush()
        logger.info(
            f"Langfuse session trace logged (session_id={report.session_id}, outcome={outcome})"
        )
    except Exception as e:
        logger.warning(f"Langfuse session logging failed: {e}", exc_info=True)


# ─── Shutdown ─────────────────────────────────────────────────────────────────


def shutdown_langfuse() -> None:
    """Flush and shutdown the Langfuse client. Call on app shutdown."""
    global _langfuse_client
    if _langfuse_client is not None:
        try:
            _langfuse_client.flush()
            if hasattr(_langfuse_client, "shutdown"):
                _langfuse_client.shutdown()
            logger.info("Langfuse client shut down")
        except Exception as e:
            logger.warning(f"Langfuse shutdown error: {e}")
        _langfuse_client = None
