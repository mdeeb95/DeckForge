"""Tests for Langfuse logger — verifies user_id, session_id, and v3 API usage."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.llm.langfuse_logger import (
    log_prediction_trace,
    log_feedback_scores,
    log_claude_session_trace,
    _to_trace_hex,
    _stringify_metadata,
)


@pytest.fixture
def mock_langfuse():
    """Patch _get_langfuse and propagate_attributes for unit testing."""
    mock_client = MagicMock()
    mock_propagate = MagicMock()
    with patch("app.llm.langfuse_logger._get_langfuse", return_value=mock_client), \
         patch("app.llm.langfuse_logger.propagate_attributes", mock_propagate):
        yield mock_client, mock_propagate


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


# ── _to_trace_hex ─────────────────────────────────────────────────────────


class TestToTraceHex:
    def test_uuid_dashes_removed(self):
        result = _to_trace_hex("550e8400-e29b-41d4-a716-446655440000")
        assert result == "550e8400e29b41d4a716446655440000"
        assert len(result) == 32

    def test_already_hex_passthrough(self):
        hex_id = "550e8400e29b41d4a716446655440000"
        assert _to_trace_hex(hex_id) == hex_id

    def test_non_uuid_hashed_to_32_hex(self):
        result = _to_trace_hex("some-non-uuid-string")
        assert len(result) == 32
        assert all(c in "0123456789abcdef" for c in result)

    def test_deterministic(self):
        assert _to_trace_hex("same-input") == _to_trace_hex("same-input")


# ── log_prediction_trace ──────────────────────────────────────────────────


class TestLogPredictionTrace:
    def test_user_id_propagated(self, mock_langfuse):
        client, propagate = mock_langfuse
        log_prediction_trace(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            call_type="level_2_feature",
            prompt="test prompt",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_abc123",
            session_id="sess-abc",
        )
        propagate.assert_called_once()
        call_kwargs = propagate.call_args.kwargs
        assert call_kwargs["user_id"] == "google_abc123"
        assert call_kwargs["session_id"] == "sess-abc"

    def test_trace_context_uses_hex_id(self, mock_langfuse):
        client, _ = mock_langfuse
        log_prediction_trace(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            call_type="level_2_bug",
            prompt="test",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_xyz",
        )
        root_call = client.start_as_current_observation.call_args_list[0]
        assert root_call.kwargs["trace_context"]["trace_id"] == "550e8400e29b41d4a716446655440000"

    def test_span_and_generation_created(self, mock_langfuse):
        client, _ = mock_langfuse
        log_prediction_trace(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            call_type="level_3_plan",
            prompt="plan",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_u1",
        )
        call_types = [
            c.kwargs.get("as_type") for c in client.start_as_current_observation.call_args_list
        ]
        assert "span" in call_types
        assert "generation" in call_types

    def test_session_id_none_allowed(self, mock_langfuse):
        client, propagate = mock_langfuse
        log_prediction_trace(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            call_type="level_2_bug",
            prompt="test",
            llm_response=_make_llm_response(),
            request=_make_request(session_id=None),
            user_id="google_xyz789",
        )
        assert propagate.call_args.kwargs["session_id"] is None

    def test_flush_called(self, mock_langfuse):
        client, _ = mock_langfuse
        log_prediction_trace(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            call_type="exploration",
            prompt="explore",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_u2",
        )
        client.flush.assert_called_once()


# ── log_feedback_scores ───────────────────────────────────────────────────


class TestLogFeedbackScores:
    def test_scores_use_hex_trace_id(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            user_action="selected",
            computed_reward=0.7,
            user_id="google_feedback_user",
        )
        for call in client.create_score.call_args_list:
            assert call.kwargs["trace_id"] == "550e8400e29b41d4a716446655440000"

    def test_user_id_in_event_span_metadata(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            user_action="selected",
            computed_reward=0.7,
            user_id="google_feedback_user",
        )
        span = client.start_as_current_observation.return_value.__enter__.return_value
        span.update.assert_called_once()
        metadata = span.update.call_args.kwargs["metadata"]
        assert metadata["user_id"] == "google_feedback_user"
        assert metadata["action"] == "selected"

    def test_feedback_metadata_all_strings(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            user_action="selected",
            computed_reward=0.85,
            user_id="google_u3",
            selection_speed_ms=1500,
            selected_index=1,
            reroll_count=2,
            plan_approved=True,
            used_unhinged_modifier=False,
        )
        span = client.start_as_current_observation.return_value.__enter__.return_value
        metadata = span.update.call_args.kwargs["metadata"]
        assert all(isinstance(v, str) for v in metadata.values())

    def test_user_id_none_omitted_from_metadata(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            user_action="rerolled",
            computed_reward=-0.3,
        )
        span = client.start_as_current_observation.return_value.__enter__.return_value
        metadata = span.update.call_args.kwargs["metadata"]
        assert "user_id" not in metadata

    def test_three_scores_with_speed(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            user_action="selected",
            computed_reward=0.85,
            user_id="google_u3",
            selection_speed_ms=1500,
        )
        assert client.create_score.call_count == 3

    def test_two_scores_without_speed(self, mock_langfuse):
        client, _ = mock_langfuse
        log_feedback_scores(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            user_action="rerolled",
            computed_reward=-0.3,
        )
        assert client.create_score.call_count == 2


# ── log_claude_session_trace ──────────────────────────────────────────────


class TestLogClaudeSessionTrace:
    def test_user_id_and_session_id_propagated(self, mock_langfuse):
        client, propagate = mock_langfuse
        log_claude_session_trace(
            _make_session_report(),
            user_id="google_session_user",
            session_id="sess-xyz",
        )
        propagate.assert_called_once()
        assert propagate.call_args.kwargs["user_id"] == "google_session_user"
        assert propagate.call_args.kwargs["session_id"] == "sess-xyz"

    def test_session_id_falls_back_to_report(self, mock_langfuse):
        client, propagate = mock_langfuse
        log_claude_session_trace(
            _make_session_report(session_id="report-session-id"),
            user_id="google_u4",
        )
        assert propagate.call_args.kwargs["session_id"] == "report-session-id"

    def test_trace_id_is_32_hex(self, mock_langfuse):
        client, _ = mock_langfuse
        log_claude_session_trace(
            _make_session_report(),
            user_id="google_u",
        )
        root_call = client.start_as_current_observation.call_args
        trace_id = root_call.kwargs["trace_context"]["trace_id"]
        assert len(trace_id) == 32
        assert all(c in "0123456789abcdef" for c in trace_id)

    def test_four_scores_created(self, mock_langfuse):
        client, _ = mock_langfuse
        log_claude_session_trace(
            _make_session_report(),
            user_id="google_u8",
        )
        assert client.create_score.call_count == 4
        score_names = {c.kwargs["name"] for c in client.create_score.call_args_list}
        assert score_names == {"session_cost_usd", "session_duration_ms", "session_outcome", "total_tokens"}

    def test_outcome_success(self, mock_langfuse):
        client, _ = mock_langfuse
        log_claude_session_trace(
            _make_session_report(is_error=False, was_interrupted=False),
            user_id="google_u5",
        )
        outcome_call = [
            c for c in client.create_score.call_args_list
            if c.kwargs.get("name") == "session_outcome"
        ]
        assert outcome_call[0].kwargs["value"] == 1.0

    def test_outcome_interrupted(self, mock_langfuse):
        client, _ = mock_langfuse
        log_claude_session_trace(
            _make_session_report(was_interrupted=True),
            user_id="google_u6",
        )
        outcome_call = [
            c for c in client.create_score.call_args_list
            if c.kwargs.get("name") == "session_outcome"
        ]
        assert outcome_call[0].kwargs["value"] == 0.5

    def test_outcome_error(self, mock_langfuse):
        client, _ = mock_langfuse
        log_claude_session_trace(
            _make_session_report(is_error=True, was_interrupted=False),
            user_id="google_u7",
        )
        outcome_call = [
            c for c in client.create_score.call_args_list
            if c.kwargs.get("name") == "session_outcome"
        ]
        assert outcome_call[0].kwargs["value"] == 0.0


# ── _stringify_metadata ──────────────────────────────────────────────────


class TestStringifyMetadata:
    def test_all_values_become_strings(self):
        raw = {"session_number": 0, "was_unhinged": False, "screen": "level_2"}
        result = _stringify_metadata(raw)
        assert all(isinstance(v, str) for v in result.values())
        assert result == {"session_number": "0", "was_unhinged": "False", "screen": "level_2"}

    def test_none_values_dropped(self):
        raw = {"key": "value", "empty": None}
        result = _stringify_metadata(raw)
        assert "empty" not in result
        assert result == {"key": "value"}

    def test_list_values_stringified(self):
        raw = {"tools_used": ["Edit", "Read"]}
        result = _stringify_metadata(raw)
        assert result == {"tools_used": "['Edit', 'Read']"}

    def test_propagate_receives_string_metadata(self, mock_langfuse):
        """Ensure propagate_attributes gets string-only metadata in prediction trace."""
        client, propagate = mock_langfuse
        log_prediction_trace(
            trace_id="550e8400-e29b-41d4-a716-446655440000",
            call_type="level_2_feature",
            prompt="test prompt",
            llm_response=_make_llm_response(),
            request=_make_request(),
            user_id="google_abc123",
            session_id="sess-abc",
        )
        metadata = propagate.call_args.kwargs["metadata"]
        assert all(isinstance(v, str) for v in metadata.values())
