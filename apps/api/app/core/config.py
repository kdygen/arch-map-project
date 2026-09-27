"""Centralized application configuration, loaded from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_DATABASE_URL = "postgresql+psycopg://archmap:archmap@localhost:5432/archmap"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = LOCAL_DATABASE_URL
    # Comma-separated list of origins allowed to call the API from a browser.
    cors_allowed_origins: str = "http://localhost:3000"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Accept plain Postgres URLs, such as the ones Supabase provides.

        SQLAlchemy needs the driver named explicitly, so `postgres://` and
        `postgresql://` are rewritten to `postgresql+psycopg://`.
        """
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
