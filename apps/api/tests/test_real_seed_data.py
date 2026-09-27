"""Checks on the real dataset in `data/seed/`."""

from pathlib import Path

import pytest

from app.catalog.enums import CURATED_FIELDS
from app.seeding.importer import import_seed
from app.seeding.loader import load_seed

REAL_SEED_DIR = Path(__file__).resolve().parents[3] / "data" / "seed"


@pytest.fixture(scope="module")
def data():
    return load_seed(REAL_SEED_DIR)


def test_real_seed_data_is_valid(data):
    assert len(data.places) >= 5


def test_every_real_place_is_fully_sourced(data):
    for place in data.places:
        sourced = {entry.field for entry in place.provenance}
        assert {"location", "architects", "styles", "year_built", "public_access"} <= sourced, (
            place.slug
        )
        assert not sourced & CURATED_FIELDS, place.slug
        assert place.website_url is not None, place.slug


def test_every_key_claim_quotes_or_explains_its_source(data):
    for place in data.places:
        for entry in place.provenance:
            assert entry.note, f"{place.slug}: {entry.field} has no note"


@pytest.mark.integration
def test_real_seed_data_imports_idempotently(db_session, data):
    first = import_seed(db_session, data)
    second = import_seed(db_session, data)

    assert first.created["places"] == len(data.places)
    assert not second.has_changes


@pytest.mark.integration
def test_real_places_are_served_by_the_api(db_session, catalog_client, data):
    import_seed(db_session, data)

    body = catalog_client.get("/api/v1/places").json()

    assert body["total"] == sum(p.status == "published" for p in data.places)
    for item in body["items"]:
        # Everything in the first dataset is in the Boston area.
        assert 42.2 < item["latitude"] < 42.5
        assert -71.3 < item["longitude"] < -70.9
