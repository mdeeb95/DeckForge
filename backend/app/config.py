from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # LLM API keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./deckforge.db"

    # Langfuse
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_host: str = ""

    # Auth
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 30

    # CORS
    allowed_origins: str = "tauri://localhost,http://localhost:1420,http://localhost:8000"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def async_database_url(self) -> str:
        """Convert DATABASE_URL to async driver format for SQLAlchemy."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def default_provider(self) -> str:
        if self.anthropic_api_key:
            return "anthropic"
        if self.openai_api_key:
            return "openai"
        if self.google_api_key:
            return "google"
        return "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
