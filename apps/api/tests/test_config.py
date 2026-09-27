import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    "raw",
    [
        "postgres://u:p@host:5432/db",
        "postgresql://u:p@host:5432/db",
        "postgresql+psycopg://u:p@host:5432/db",
    ],
)
def test_database_url_always_uses_psycopg_driver(raw):
    settings = Settings(_env_file=None, database_url=raw)

    assert settings.database_url == "postgresql+psycopg://u:p@host:5432/db"


def test_cors_origins_are_parsed_from_comma_separated_string():
    settings = Settings(
        _env_file=None,
        cors_allowed_origins="http://localhost:3000, https://example.com,",
    )

    assert settings.cors_origins == ["http://localhost:3000", "https://example.com"]


def test_unknown_environment_is_rejected():
    with pytest.raises(ValueError):
        Settings(_env_file=None, environment="staging")
