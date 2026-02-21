"""Shared test fixtures for DeckForge backend tests."""
from __future__ import annotations

import uuid
import hashlib
import asyncio
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.db.models import Base, User, AuthToken, InviteCode
from app.db.session import get_db
from app.config import get_settings, Settings
from app.rate_limit import limiter as app_limiter
from app.main import app


# Use in-memory SQLite for tests
TEST_DB_URL = "sqlite+aiosqlite://"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_session():
    """Create a fresh in-memory database for each test."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    """Create an httpx AsyncClient with the test database injected."""
    app_limiter.enabled = False

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    app_limiter.enabled = True


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user in the database."""
    user = User(
        anonymized_id="google_test123456789",
        email="test@example.com",
        display_name="Test User",
        google_sub="test_google_sub_12345",
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    """Create an admin user in the database."""
    user = User(
        anonymized_id="google_admin123456789",
        email="mdeeb95@gmail.com",
        display_name="Admin User",
        google_sub="admin_google_sub_12345",
        is_active=True,
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def deactivated_user(db_session: AsyncSession) -> User:
    """Create a deactivated user."""
    user = User(
        anonymized_id="google_deactivated1234",
        email="deactivated@example.com",
        display_name="Deactivated User",
        google_sub="deactivated_google_sub",
        is_active=False,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def invite_code(db_session: AsyncSession) -> InviteCode:
    """Create a valid invite code."""
    code = InviteCode(
        code="TESTCODE",
        max_uses=5,
        times_used=0,
        is_active=True,
    )
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code


@pytest_asyncio.fixture
async def depleted_invite(db_session: AsyncSession) -> InviteCode:
    """Create an invite code that's been fully used."""
    code = InviteCode(
        code="DEPLETED",
        max_uses=1,
        times_used=1,
        is_active=True,
    )
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code


@pytest_asyncio.fixture
async def expired_invite(db_session: AsyncSession) -> InviteCode:
    """Create an expired invite code."""
    code = InviteCode(
        code="EXPIRED1",
        max_uses=5,
        times_used=0,
        is_active=True,
        expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code


@pytest_asyncio.fixture
async def deactivated_invite(db_session: AsyncSession) -> InviteCode:
    """Create a deactivated invite code."""
    code = InviteCode(
        code="DISABLED",
        max_uses=5,
        times_used=0,
        is_active=False,
    )
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code


def make_access_token(user_id: str) -> str:
    """Create a valid access token for testing."""
    import jwt as pyjwt
    from datetime import timedelta
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "exp": now + timedelta(minutes=60),
        "type": "access",
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def make_refresh_token(user_id: str) -> str:
    """Create a valid refresh token for testing."""
    import jwt as pyjwt
    from datetime import timedelta
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "exp": now + timedelta(days=30),
        "type": "refresh",
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def make_expired_token(user_id: str) -> str:
    """Create an expired access token for testing."""
    import jwt as pyjwt
    from datetime import timedelta
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "exp": now - timedelta(minutes=1),
        "type": "access",
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def make_stored_access_token(user: User, db: AsyncSession) -> str:
    """Create a valid access token WITH a matching AuthToken DB row.

    Use this for tests that exercise the middleware's token revocation check.
    JWT-only tests (expired, missing header) can still use make_access_token().
    """
    import jwt as pyjwt
    from datetime import timedelta
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=60)

    access_payload = {"sub": str(user.id), "exp": expires_at, "type": "access"}
    access_token = pyjwt.encode(access_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    refresh_payload = {"sub": str(user.id), "exp": now + timedelta(days=30), "type": "refresh"}
    refresh_token = pyjwt.encode(refresh_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    auth_record = AuthToken(
        user_id=user.id,
        token_hash=hashlib.sha256(access_token.encode()).hexdigest(),
        refresh_hash=hashlib.sha256(refresh_token.encode()).hexdigest(),
        expires_at=expires_at,
    )
    db.add(auth_record)
    await db.commit()

    return access_token
