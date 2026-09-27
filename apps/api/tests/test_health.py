import pytest
from sqlalchemy import create_engine, text

from app.core.db import get_engine
from app.main import app


def test_health_returns_healthy(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_health_allows_configured_browser_origin(client):
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:3000"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_health_does_not_allow_unknown_origin(client):
    response = client.get("/api/v1/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers


def test_ready_returns_503_when_database_is_unreachable(client):
    # Port 1 refuses connections, so this never needs a real database.
    unreachable = create_engine(
        "postgresql+psycopg://user:pass@127.0.0.1:1/none",
        connect_args={"connect_timeout": 2},
    )
    app.dependency_overrides[get_engine] = lambda: unreachable
    try:
        response = client.get("/api/v1/health/ready")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable"}


@pytest.mark.integration
def test_ready_returns_ready_with_database(client, require_database):
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok"}


@pytest.mark.integration
def test_postgis_is_installed_by_migrations(require_database):
    with get_engine().connect() as connection:
        version = connection.execute(text("SELECT postgis_version()")).scalar_one()

    assert version
