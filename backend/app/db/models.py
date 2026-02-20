import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, Numeric,
    DateTime, ForeignKey, UniqueConstraint, Index, Uuid,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


# ─── 9.1 users ───────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    anonymized_id = Column(Text, unique=True, nullable=False)

    # Google identity
    email = Column(Text, unique=True, nullable=True)
    display_name = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    google_sub = Column(Text, unique=True, nullable=True)

    # Access control
    is_active = Column(Boolean, nullable=False, default=True)
    is_admin = Column(Boolean, nullable=False, default=False)
    invite_code_used = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_seen_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    app_version = Column(Text)
    plan_tier = Column(Text, nullable=False, default="free")

    auth_tokens = relationship("AuthToken", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")


# ─── 9.2 auth_tokens ─────────────────────────────────────────────────────────

class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(Text, nullable=False)
    refresh_hash = Column(Text, nullable=False)
    issued_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="auth_tokens")

    __table_args__ = (
        Index("idx_auth_tokens_user", "user_id"),
    )


# ─── 9.3 api_keys ────────────────────────────────────────────────────────────

class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(Text, nullable=False)  # anthropic | openai | google
    encrypted_key = Column(Text, nullable=False)
    key_prefix = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_used_at = Column(DateTime(timezone=True))
    is_valid = Column(Boolean, nullable=False, default=True)

    user = relationship("User", back_populates="api_keys")

    __table_args__ = (
        Index("idx_api_keys_user", "user_id"),
    )


# ─── 9.4 prompt_templates ────────────────────────────────────────────────────

class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    name = Column(Text, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    template_text = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    ab_test_group = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (
        UniqueConstraint("name", "version", "ab_test_group"),
        Index("idx_prompt_templates_active", "name", "is_active"),
    )


# ─── 9.5 project_sync ────────────────────────────────────────────────────────

class ProjectSync(Base):
    __tablename__ = "project_sync"

    id = Column(Uuid, primary_key=True)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type_detected = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False)
    total_sessions = Column(Integer, nullable=False, default=0)
    total_tasks = Column(Integer, nullable=False, default=0)
    last_synced_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (
        Index("idx_project_sync_user", "user_id"),
    )


# ─── 9.6 prediction_calls ────────────────────────────────────────────────────

class PredictionCall(Base):
    __tablename__ = "prediction_calls"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False)
    trace_id = Column(Text)
    call_type = Column(Text, nullable=False)
    model_used = Column(Text, nullable=False)
    input_tokens = Column(Integer, nullable=False)
    output_tokens = Column(Integer, nullable=False)
    cost_usd = Column(Numeric(10, 6), nullable=False)
    latency_ms = Column(Integer, nullable=False)
    cache_hit = Column(Boolean, nullable=False, default=False)
    ab_test_group = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (
        Index("idx_prediction_calls_user", "user_id", "created_at"),
        Index("idx_prediction_calls_type", "call_type", "created_at"),
    )


# ─── 9.7 circuit_breaker_state ───────────────────────────────────────────────

class CircuitBreakerState(Base):
    __tablename__ = "circuit_breaker_state"

    user_id = Column(Uuid, ForeignKey("users.id"), primary_key=True)
    consecutive_failures = Column(Integer, nullable=False, default=0)
    last_failure_at = Column(DateTime(timezone=True))
    degraded_until = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


# ─── invite_codes ────────────────────────────────────────────────────────────

class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(Uuid, primary_key=True, default=new_uuid)
    code = Column(Text, unique=True, nullable=False)          # 8-char alphanumeric
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_by = Column(Text, nullable=False, default="admin") # who generated it
    max_uses = Column(Integer, nullable=False, default=1)      # how many times it can be redeemed
    times_used = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True))               # null = never expires
    is_active = Column(Boolean, nullable=False, default=True)  # admin can disable
    note = Column(Text)                                        # admin note ("for beta testers", etc.)
