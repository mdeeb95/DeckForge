"""Tests for Langfuse logger — verifies user_id and session_id flow correctly."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.llm.langfuse_logger import (
    log_prediction_trace,
    log_feedback_scores,
    log_claude_session_trace,
)


@pytest.fixture
def mock_langfuse():
    """Patch _get_langfuse to return a mock client with chainable trace."""
    mock_client = MagicMock()
    mock_trace = MagicMock()
    mock_client.trace.return_value = mock_trace
    with patch("app.llm.langfuse_logger._get_langfuse", return_value=mock_client):
        yield mock_client, mock_trace


def _make_llm_response(**overrides):
    defaults = {
        "model": "claude-sonnet-4-20250514",
        "content": '{"suggestions": []}',
        "input_tokens": 100,
        "output_tokens": 50,
        "latency_ms": 200,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_request(**overrides):
    defaults = {
        "context_payload": {"project": {"type_detected": "svelte"}, "session": {"session_number": 1}},
        "session_id": "sess-abc",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_session_report(**overrides):
    defaults = {
        "session_id": "sess-xyz",
        "prompt": "Fix the bug",
        "result": "Done",
        "is_error": False,
        "was_interrupted": False,
        "was_unhinged": False,
        "duration_ms": 5000.0,
        "num_turns": 3,
        "cost_usd": 0.02,
        "input_tokens": 500,
        "output_tokens": 200,
        "tools_used": ["Edit", "Read"],
        "files_affected": ["src/main.ts"],
        "project_path": "/home/user/project",
        "prediction_trace_id": "pred-trace-1",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ── log_prediction_trace ──────────────────────────────────────────────────


class TestLogPredictionTrace:
    def test_user_id_passed_to_trace(self, mock_langfuse):
        client, trace = mock_langfuse
        log_prediction_trace(
            trace_id="t1",
            call_type="level_2_feature",
            prompt="test prompt",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_abc123",
            session_id="sess-abc",
        )

        client.trace.assert_called_once()
        call_kwargs = client.trace.call_args.kwargs
        assert call_kwargs["user_id"] == "google_abc123"
        assert call_kwargs["session_id"] == "sess-abc"

    def test_session_id_none_allowed(self, mock_langfuse):
        client, trace = mock_langfuse
        log_prediction_trace(
            trace_id="t2",
            call_type="level_2_bug",
            prompt="test",
            llm_response=_make_llm_response(),
            request=_make_request(session_id=None),
            user_id="google_xyz789",
        )

        call_kwargs = client.trace.call_args.kwargs
        assert call_kwargs["user_id"] == "google_xyz789"
        assert call_kwargs["session_id"] is None

    def test_generation_created_under_trace(self, mock_langfuse):
        client, trace = mock_langfuse
        log_prediction_trace(
            trace_id="t3",
            call_type="level_3_plan",
            prompt="plan prompt",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_u1",
            session_id="sess-1",
        )

        trace.generation.assert_called_once()
        gen_kwargs = trace.generation.call_args.kwargs
        assert gen_kwargs["name"] == "level_3_plan"
        assert gen_kwargs["input"] == "plan prompt"

    def test_flush_called(self, mock_langfuse):
        client, _ = mock_langfuse
        log_prediction_trace(
            trace_id="t4",
            call_type="exploration",
            prompt="explore",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_u2",
        )

        client.flush.assert_called_once()


# ── log_feedback_scores ───────────────────────────────────────────────────


class TestLogFeedbackScores:
    def test_user_id_in_event_metadata(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="t5",
            user_action="selected",
            computed_reward=0.7,
            user_id="google_feedback_user",
            selected_index=0,
        )

        # Find the event call
        client.event.assert_called_once()
        event_kwargs = client.event.call_args.kwargs
        assert event_kwargs["metadata"]["user_id"] == "google_feedback_user"
        assert event_kwargs["metadata"]["action"] == "selected"

    def test_user_id_none_omitted_from_metadata(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="t6",
            user_action="rerolled",
            computed_reward=-0.3,
        )

        event_kwargs = client.event.call_args.kwargs
        assert "user_id" not in event_kwargs["metadata"]

    def test_scores_logged(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="t7",
            user_action="selected",
            computed_reward=0.85,
            user_id="google_u3",
            selection_speed_ms=1500,
        )

        # user_selection + computed_reward + selection_speed = 3 score calls
        assert client.score.call_count == 3


# ── log_claude_session_trace ──────────────────────────────────────────────


class TestLogClaudeSessionTrace:
    def test_user_id_and_session_id_on_trace(self, mock_langfuse):
        client, trace = mock_langfuse
        log_claude_session_trace(
            _make_session_report(),
            user_id="google_session_user",
            session_id="sess-xyz",
        )

        call_kwargs = client.trace.call_args.kwargs
        assert call_kwargs["user_id"] == "google_session_user"
        assert call_kwargs["session_id"] == "sess-xyz"

    def test_session_id_falls_back_to_report(self, mock_langfuse):
        client, _ = mock_langfuse
        log_claude_session_trace(
            _make_session_report(session_id="report-session-id"),
            user_id="google_u4",
        )

        call_kwargs = client.trace.call_args.kwargs
        assert call_kwargs["session_id"] == "report-session-id"

    def test_outcome_scores(self, mock_langfuse):
        client, trace = mock_langfuse

        # Success case
        log_claude_session_trace(
            _make_session_report(is_error=False, was_interrupted=False),
            user_id="google_u5",
        )
        outcome_call = [
            c for c in trace.score.call_args_list
            if c.kwargs.get("name") == "session_outcome"
        ]
        assert outcome_call[0].kwargs["value"] == 1.0

    def test_interrupted_outcome(self, mock_langfuse):
        client, trace = mock_langfuse
        log_claude_session_trace(
            _make_session_report(was_interrupted=True),
            user_id="google_u6",
        )
        outcome_call = [
            c for c in trace.score.call_args_list
            if c.kwargs.get("name") == "session_outcome"
        ]
        assert outcome_call[0].kwargs["value"] == 0.5

    def test_error_outcome(self, mock_langfuse):
        client, trace = mock_langfuse
        log_claude_session_trace(
            _make_session_report(is_error=True, was_interrupted=False),
            user_id="google_u7",
        )
        outcome_call = [
            c for c in trace.score.call_args_list
            if c.kwargs.get("name") == "session_outcome"
        ]
        assert outcome_call[0].kwargs["value"] == 0.0
