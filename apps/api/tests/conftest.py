import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, make_url, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import check_database, get_engine, get_session
from app.main import app
from tests.seed_fixture import write_seed

API_ROOT = Path(__file__).resolve().parents[1]
TEST_SUFFIX = "_test"


def alembic_config(database_url: str) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.attributes["database_url"] = database_url
    config.attributes["skip_logging"] = True
    return config


def recreate_database(name: str) -> str:
    """Drop and create a throwaway database next to the configured one."""
    if not name.endswith(TEST_SUFFIX) and TEST_SUFFIX not in name:
        raise RuntimeError(f"Refusing to recreate non-test database '{name}'")
    base_url = make_url(get_settings().database_url)
    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()
    return base_url.set(database=name).render_as_string(hide_password=False)


def drop_database(name: str) -> None:
    if TEST_SUFFIX not in name:
        raise RuntimeError(f"Refusing to drop non-test database '{name}'")
    admin = create_engine(get_settings().database_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    admin.dispose()


def skip_or_fail_without_database() -> None:
    """Skip database tests locally when no database runs. In CI that is a failure."""
    try:
        check_database(get_engine())
    except SQLAlchemyError:
        if os.environ.get("CI"):
            raise
        pytest.skip("PostgreSQL is not running. Start it with `make db-up`.")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def require_database() -> None:
    skip_or_fail_without_database()


@pytest.fixture(scope="session")
def test_database_name() -> str:
    return make_url(get_settings().database_url).database + TEST_SUFFIX


@pytest.fixture(scope="session")
def migrated_engine(test_database_name: str) -> Iterator[Engine]:
    """A fresh database with all migrations applied from scratch.

    Tests never touch the development database.
    """
    skip_or_fail_without_database()
    url = recreate_database(test_database_name)
    command.upgrade(alembic_config(url), "head")
    engine = create_engine(url)
    yield engine
    engine.dispose()
    drop_database(test_database_name)


@pytest.fixture
def db_session(migrated_engine: Engine) -> Iterator[Session]:
    """A session whose work is rolled back after each test."""
    with migrated_engine.connect() as connection:
        transaction = connection.begin()
        session = Session(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def catalog_client(db_session: Session) -> Iterator[TestClient]:
    """An API client that reads from the test session."""
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def seed_dir(tmp_path: Path) -> Path:
    """A directory holding the small fictional test dataset."""
    return write_seed(tmp_path)


@pytest.fixture
def seeded_session(db_session: Session, seed_dir: Path) -> Session:
    from app.seeding.importer import import_seed
    from app.seeding.loader import load_seed

    import_seed(db_session, load_seed(seed_dir))
    db_session.expire_all()
    return db_session


@pytest.fixture
def seeded_client(seeded_session: Session, catalog_client: TestClient) -> TestClient:
    return catalog_client
