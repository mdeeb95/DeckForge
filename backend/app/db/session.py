from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import get_settings

settings = get_settings()

# Use async_database_url to auto-convert postgresql:// → postgresql+asyncpg://
db_url = settings.async_database_url

if db_url.startswith("sqlite"):
    engine = create_async_engine(
        db_url,
        echo=False,
    )
else:
    engine = create_async_engine(
        db_url,
        echo=False,
        pool_size=5,
        max_overflow=10,
    )

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with AsyncSessionLocal() as session:
        yield session
