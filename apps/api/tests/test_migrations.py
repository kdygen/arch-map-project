import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.catalog import models  # noqa: F401
from app.core.db import Base
from tests.conftest import alembic_config, drop_database, recreate_database

pytestmark = pytest.mark.integration

EXPECTED_TABLES = {
    "places",
    "cities",
    "architects",
    "place_architects",
    "styles",
    "place_styles",
    "periods",
    "building_types",
    "tags",
    "place_tags",
    "place_images",
    "opening_hours",
    "opening_hours_exceptions",
    "sources",
    "place_field_sources",
}


def test_migrations_create_every_catalog_table(migrated_engine):
    tables = set(inspect(migrated_engine).get_table_names())

    assert EXPECTED_TABLES <= tables


def test_database_is_at_the_latest_revision(migrated_engine):
    head = ScriptDirectory.from_config(alembic_config("unused")).get_current_head()
    with migrated_engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()

    assert current == head


def test_models_and_migrations_do_not_drift(migrated_engine):
    def include_object(obj, name, type_, reflected, compare_to):
        return not (type_ == "table" and reflected and compare_to is None)

    with migrated_engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"include_object": include_object})
        differences = compare_metadata(context, Base.metadata)

    assert differences == []


def test_place_location_has_spatial_indexes(migrated_engine):
    with migrated_engine.connect() as connection:
        rows = connection.execute(
            text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'places'")
        ).all()
    definitions = {name: definition for name, definition in rows}

    assert "USING gist (location)" in definitions["ix_places_location_gist"]
    assert "USING gist (((location)::geometry))" in definitions["ix_places_location_geometry_gist"]


def test_location_column_is_geography_point_4326(migrated_engine):
    with migrated_engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT type, srid FROM geography_columns "
                "WHERE f_table_name = 'places' AND f_geography_column = 'location'"
            )
        ).one()

    assert tuple(row) == ("Point", 4326)


def test_migrations_downgrade_and_upgrade_again(require_database, test_database_name):
    name = test_database_name + "_roundtrip"
    url = recreate_database(name)
    config = alembic_config(url)
    try:
        command.upgrade(config, "head")
        command.downgrade(config, "base")
        engine = create_engine(url)
        assert not EXPECTED_TABLES & set(inspect(engine).get_table_names())
        engine.dispose()
        command.upgrade(config, "head")
        engine = create_engine(url)
        assert EXPECTED_TABLES <= set(inspect(engine).get_table_names())
        engine.dispose()
    finally:
        drop_database(name)
