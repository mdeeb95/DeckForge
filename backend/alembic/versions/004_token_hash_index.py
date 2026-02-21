"""Add index on auth_tokens.token_hash for O(1) SHA-256 lookup

Revision ID: 004
Revises: 003
Create Date: 2026-02-20
"""
from typing import Sequence, Union
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("idx_auth_tokens_hash", "auth_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("idx_auth_tokens_hash", table_name="auth_tokens")
