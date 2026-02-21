"""Admin audit log

Revision ID: 003
Revises: 002
Create Date: 2026-02-20
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "admin_audit_log" not in inspect(op.get_bind()).get_table_names():
        op.create_table(
            "admin_audit_log",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("admin_email", sa.Text(), nullable=False),
            sa.Column("action", sa.Text(), nullable=False),
            sa.Column("target_type", sa.Text(), nullable=False),
            sa.Column("target_id", sa.Text(), nullable=False),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("admin_audit_log")
