import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import check_database, get_engine
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def require_database() -> None:
    """Skip integration tests when no database is running locally.

    In CI a missing database is a failure, never a skip.
    """
    try:
        check_database(get_engine())
    except SQLAlchemyError:
        if os.environ.get("CI"):
            raise
        pytest.skip("PostgreSQL is not running. Start it with `make db-up`.")
