from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Wordle API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    DATABASE_URL: str = (
        "postgresql+asyncpg://wordle:wordle@localhost:5432/wordle"
    )

    MIN_WORD_LENGTH: int = 5
    MAX_WORD_LENGTH: int = 8

    DB_LOCK_TIMEOUT_MS: int = 5000
    DB_STATEMENT_TIMEOUT_MS: int = 10000

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def dictionary_dir(self) -> Path:
        return Path(__file__).resolve().parents[2] / "dictionary_files"

settings = Settings()
