"""Google auth and invite codes

Revision ID: 002
Revises: 001
Create Date: 2026-02-20
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add Google identity columns to users (skip if already present)
    existing = [c["name"] for c in inspect(op.get_bind()).get_columns("users")]
    new_columns = [
        ("email", sa.Column("email", sa.Text(), nullable=True)),
        ("display_name", sa.Column("display_name", sa.Text(), nullable=True)),
        ("avatar_url", sa.Column("avatar_url", sa.Text(), nullable=True)),
        ("google_sub", sa.Column("google_sub", sa.Text(), nullable=True)),
        ("is_active", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true"))),
        ("is_admin", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false"))),
        ("invite_code_used", sa.Column("invite_code_used", sa.Text(), nullable=True)),
    ]
    cols_to_add = [(name, col) for name, col in new_columns if name not in existing]

    if cols_to_add:
        with op.batch_alter_table("users") as batch_op:
            for col_name, col in cols_to_add:
                batch_op.add_column(col)
            # Unique constraints added separately (batch mode handles SQLite)
            batch_op.create_unique_constraint("uq_users_email", ["email"])
            batch_op.create_unique_constraint("uq_users_google_sub", ["google_sub"])

    # Create invite_codes table
    if "invite_codes" not in inspect(op.get_bind()).get_table_names():
        op.create_table(
            "invite_codes",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("code", sa.Text(), unique=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("created_by", sa.Text(), nullable=False, server_default="admin"),
            sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("times_used", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("note", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("invite_codes")
    op.drop_column("users", "invite_code_used")
    op.drop_column("users", "is_admin")
    op.drop_column("users", "is_active")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "display_name")
    op.drop_column("users", "email")
