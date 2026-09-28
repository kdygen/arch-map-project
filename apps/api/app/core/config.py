"""Centralized application configuration, loaded from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
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

    # Server-side Google key, restricted to the Routes API. Optional: without
    # it the app still runs, and only route requests fail with a clear error.
    # SecretStr keeps the value out of reprs, logs, and tracebacks.
    google_maps_server_key: SecretStr | None = None
    routes_timeout_seconds: float = 10.0

    @field_validator("google_maps_server_key", mode="before")
    @classmethod
    def blank_key_is_missing(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

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
