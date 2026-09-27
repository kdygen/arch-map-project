import json

import pytest
from sqlalchemy import func, select

from app.catalog import models
from app.catalog.models import Place, PlaceFieldSource, Source, Style
from app.seeding.importer import import_seed
from app.seeding.loader import SeedValidationError, load_seed
from tests.seed_fixture import default_places, write_seed

pytestmark = pytest.mark.integration

ALL_MODELS = [
    models.City,
    models.Architect,
    models.Style,
    models.Period,
    models.BuildingType,
    models.Tag,
    models.Source,
    models.Place,
    models.PlaceArchitect,
    models.PlaceStyle,
    models.PlaceTag,
    models.PlaceImage,
    models.OpeningHours,
    models.PlaceFieldSource,
]


def row_counts(session) -> dict[str, int]:
    return {
        model.__tablename__: session.scalar(select(func.count()).select_from(model))
        for model in ALL_MODELS
    }


def get_place(session, slug: str) -> Place:
    session.expire_all()
    return session.scalars(select(Place).where(Place.slug == slug)).one()


def test_import_creates_all_records(db_session, seed_dir):
    report = import_seed(db_session, load_seed(seed_dir))

    counts = row_counts(db_session)
    assert counts["places"] == 4
    assert counts["architects"] == 3
    assert counts["styles"] == 3
    assert counts["sources"] == 1
    assert counts["place_architects"] == 5
    assert report.created["places"] == 4
    assert not report.updated


def test_import_twice_creates_no_duplicates_and_changes_nothing(db_session, seed_dir):
    import_seed(db_session, load_seed(seed_dir))
    before = row_counts(db_session)
    updated_at = get_place(db_session, "alpha-house").updated_at

    report = import_seed(db_session, load_seed(seed_dir))

    assert row_counts(db_session) == before
    assert not report.has_changes
    assert report.unchanged["places"] == 4
    assert not db_session.dirty
    assert get_place(db_session, "alpha-house").updated_at == updated_at


def test_place_ids_are_stable_across_imports(db_session, seed_dir):
    import_seed(db_session, load_seed(seed_dir))
    first = get_place(db_session, "gamma-tower").id

    import_seed(db_session, load_seed(seed_dir))

    assert get_place(db_session, "gamma-tower").id == first


def test_import_stores_coordinates_and_relationships(seeded_session):
    place = get_place(seeded_session, "gamma-tower")

    assert (place.latitude, place.longitude) == pytest.approx((42.36, -71.09))
    assert place.city.slug == "testville"
    assert place.building_type.slug == "tower"
    assert {(link.architect.slug, link.role) for link in place.architect_links} == {
        ("b-two", "architect"),
        ("c-three", "associate architect"),
    }
    assert {(link.style.slug, link.is_primary) for link in place.style_links} == {
        ("brutalism", True),
        ("classical", False),
    }
    assert {link.tag.slug for link in place.tag_links} == {"brick", "dome"}


def test_style_parent_is_resolved_even_when_listed_after_child(seeded_session):
    brutalism = seeded_session.scalars(select(Style).where(Style.slug == "brutalism")).one()

    assert brutalism.parent.slug == "modernism"


def test_changed_seed_updates_the_existing_place(db_session, tmp_path):
    import_seed(db_session, load_seed(write_seed(tmp_path)))
    places = default_places()
    places[1].update(
        name="Beta Hall Renamed",
        location={"latitude": 42.4, "longitude": -71.2},
        tags=["dome"],
        architects=[{"architect": "c-three"}],
        styles=[{"style": "classical", "is_primary": True}],
    )

    report = import_seed(db_session, load_seed(write_seed(tmp_path, places)))

    place = get_place(db_session, "beta-hall")
    assert report.updated["places"] == 1
    assert report.unchanged["places"] == 3
    assert place.name == "Beta Hall Renamed"
    assert (place.latitude, place.longitude) == pytest.approx((42.4, -71.2))
    assert [link.tag.slug for link in place.tag_links] == ["dome"]
    assert [link.architect.slug for link in place.architect_links] == ["c-three"]
    assert [(link.style.slug, link.is_primary) for link in place.style_links] == [
        ("classical", True)
    ]
    assert row_counts(db_session)["places"] == 4


def test_primary_style_can_move_to_another_existing_style(db_session, tmp_path):
    import_seed(db_session, load_seed(write_seed(tmp_path)))
    places = default_places()
    places[2]["styles"] = [
        {"style": "brutalism", "is_primary": False},
        {"style": "classical", "is_primary": True},
    ]

    import_seed(db_session, load_seed(write_seed(tmp_path, places)))

    place = get_place(db_session, "gamma-tower")
    assert {(link.style.slug, link.is_primary) for link in place.style_links} == {
        ("brutalism", False),
        ("classical", True),
    }


def test_places_missing_from_the_seed_are_never_deleted(db_session, tmp_path):
    import_seed(db_session, load_seed(write_seed(tmp_path)))

    import_seed(db_session, load_seed(write_seed(tmp_path, default_places()[:1])))

    assert row_counts(db_session)["places"] == 4


def test_invalid_seed_writes_nothing(db_session, tmp_path):
    places = default_places()
    places[3]["city"] = "atlantis"
    write_seed(tmp_path, places)

    with pytest.raises(SeedValidationError):
        import_seed(db_session, load_seed(tmp_path))

    assert row_counts(db_session)["places"] == 0


def test_opening_hours_and_images_are_imported_idempotently(db_session, tmp_path):
    places = default_places()[:1]
    places[0]["opening_hours"] = [
        {"day_of_week": 0, "opens": "10:00", "closes": "12:00"},
        {"day_of_week": 0, "opens": "13:00", "closes": "17:00"},
    ]
    places[0]["images"] = [
        {
            "storage_path": "alpha/front.jpg",
            "credit": "Test Photographer",
            "license": "CC BY 4.0",
            "source_url": "https://example.org/front.jpg",
        }
    ]
    write_seed(tmp_path, places)

    import_seed(db_session, load_seed(tmp_path))
    report = import_seed(db_session, load_seed(tmp_path))

    counts = row_counts(db_session)
    assert counts["opening_hours"] == 2
    assert counts["place_images"] == 1
    assert not report.has_changes


class TestProvenance:
    def test_each_claim_links_to_its_source(self, seeded_session):
        place = get_place(seeded_session, "alpha-house")
        by_field = {fs.field_name: fs for fs in place.field_sources}

        assert by_field["year_built"].note == "Built in 1950"
        assert by_field["year_built"].source.url == "https://example.org/reference"
        assert by_field["year_built"].source.publisher == "Example Org"
        assert str(by_field["year_built"].source.accessed_at) == "2026-01-15"

    def test_where_did_the_construction_year_come_from(self, seeded_session):
        """The question the provenance model exists to answer."""
        rows = seeded_session.execute(
            select(Source.title, Source.url, PlaceFieldSource.note)
            .join(PlaceFieldSource, PlaceFieldSource.source_id == Source.id)
            .join(Place, Place.id == PlaceFieldSource.place_id)
            .where(Place.slug == "beta-hall", PlaceFieldSource.field_name == "year_built")
        ).all()

        assert rows == [("Example reference", "https://example.org/reference", "Built in 1950")]

    def test_source_shared_by_several_places_is_stored_once(self, seeded_session):
        assert row_counts(seeded_session)["sources"] == 1
        assert row_counts(seeded_session)["place_field_sources"] == 7 * 4

    def test_no_curated_field_ever_has_provenance(self, seeded_session):
        fields = set(seeded_session.scalars(select(PlaceFieldSource.field_name)))

        assert not fields & {
            "significance_score",
            "visit_minutes_exterior",
            "visit_minutes_interior",
        }

    def test_removed_provenance_entry_is_removed_from_database(self, db_session, tmp_path):
        import_seed(db_session, load_seed(write_seed(tmp_path)))
        places = default_places()
        places[0]["provenance"].append({"field": "name", "source": "main"})
        import_seed(db_session, load_seed(write_seed(tmp_path, places)))
        assert len(get_place(db_session, "alpha-house").field_sources) == 8

        import_seed(db_session, load_seed(write_seed(tmp_path)))

        assert len(get_place(db_session, "alpha-house").field_sources) == 7


def test_seed_files_are_plain_json(seed_dir):
    for path in seed_dir.rglob("*.json"):
        assert isinstance(json.loads(path.read_text()), dict)
