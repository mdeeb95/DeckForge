"""Initial schema

Revision ID: 001
Revises:
Create Date: 2025-02-15
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _table_exists("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("anonymized_id", sa.Text(), unique=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("app_version", sa.Text()),
            sa.Column("plan_tier", sa.Text(), nullable=False, server_default="free"),
        )

    if not _table_exists("auth_tokens"):
        op.create_table(
            "auth_tokens",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.Text(), nullable=False),
            sa.Column("refresh_hash", sa.Text(), nullable=False),
            sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
        op.create_index("idx_auth_tokens_user", "auth_tokens", ["user_id"])

    if not _table_exists("api_keys"):
        op.create_table(
            "api_keys",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("provider", sa.Text(), nullable=False),
            sa.Column("encrypted_key", sa.Text(), nullable=False),
            sa.Column("key_prefix", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_used_at", sa.DateTime(timezone=True)),
            sa.Column("is_valid", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )
        op.create_index("idx_api_keys_user", "api_keys", ["user_id"])

    if not _table_exists("prompt_templates"):
        op.create_table(
            "prompt_templates",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("template_text", sa.Text(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("ab_test_group", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("name", "version", "ab_test_group"),
        )
        op.create_index("idx_prompt_templates_active", "prompt_templates", ["name", "is_active"])

    if not _table_exists("project_sync"):
        op.create_table(
            "project_sync",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("type_detected", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("total_sessions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_tasks", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_project_sync_user", "project_sync", ["user_id"])

    if not _table_exists("prediction_calls"):
        op.create_table(
            "prediction_calls",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("trace_id", sa.Text()),
            sa.Column("call_type", sa.Text(), nullable=False),
            sa.Column("model_used", sa.Text(), nullable=False),
            sa.Column("input_tokens", sa.Integer(), nullable=False),
            sa.Column("output_tokens", sa.Integer(), nullable=False),
            sa.Column("cost_usd", sa.Numeric(10, 6), nullable=False),
            sa.Column("latency_ms", sa.Integer(), nullable=False),
            sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("ab_test_group", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_prediction_calls_user", "prediction_calls", ["user_id", "created_at"])
        op.create_index("idx_prediction_calls_type", "prediction_calls", ["call_type", "created_at"])

    if not _table_exists("circuit_breaker_state"):
        op.create_table(
            "circuit_breaker_state",
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_failure_at", sa.DateTime(timezone=True)),
            sa.Column("degraded_until", sa.DateTime(timezone=True)),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("circuit_breaker_state")
    op.drop_table("prediction_calls")
    op.drop_table("project_sync")
    op.drop_table("prompt_templates")
    op.drop_table("api_keys")
    op.drop_table("auth_tokens")
    op.drop_table("users")
