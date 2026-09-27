import datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.catalog.models import (
    Architect,
    OpeningHours,
    PlaceArchitect,
    PlaceFieldSource,
    PlaceImage,
    PlaceStyle,
    PlaceTag,
    Source,
    Style,
    Tag,
)
from tests.factories import create_city, create_place

pytestmark = pytest.mark.integration


def make_source(session, url="https://example.org/a"):
    source = Source(
        title="A",
        url=url,
        publisher="Example",
        source_type="official_site",
        accessed_at=datetime.date(2026, 1, 1),
    )
    session.add(source)
    session.flush()
    return source


def test_place_slug_is_unique(db_session):
    city = create_city(db_session)
    create_place(db_session, city, "same-slug")

    with pytest.raises(IntegrityError, match="uq_places_slug"):
        create_place(db_session, city, "same-slug")


def test_architect_slug_is_unique(db_session):
    db_session.add(Architect(slug="a-one", name="A"))
    db_session.flush()
    db_session.add(Architect(slug="a-one", name="B"))

    with pytest.raises(IntegrityError, match="uq_architects_slug"):
        db_session.flush()


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"significance_score": 0}, "significance_score_range"),
        ({"significance_score": 6}, "significance_score_range"),
        ({"status": "archived"}, "status_valid"),
        ({"public_access": "sometimes"}, "public_access_valid"),
        ({"admission_type": "cheap"}, "admission_type_valid"),
        ({"country_code": "usa"}, None),
        ({"country_code": "us"}, "country_code_format"),
        ({"year_built_start": 1900, "year_built_end": 1890}, "year_built_order"),
        ({"year_built_end": 1900}, "year_built_end_requires_start"),
        ({"visit_minutes_exterior": 0}, "visit_minutes_exterior_positive"),
        ({"website_url": "example.org"}, "website_url_format"),
        ({"significance_score": None}, "published_has_significance_score"),
        ({"visit_minutes_exterior": None}, "published_has_exterior_minutes"),
    ],
)
def test_place_rejects_invalid_values(db_session, overrides, constraint):
    city = create_city(db_session)

    with pytest.raises(Exception, match=constraint):
        create_place(db_session, city, "bad-place", **overrides)


def test_place_slug_format_is_enforced(db_session):
    city = create_city(db_session)

    with pytest.raises(IntegrityError, match="slug_format"):
        create_place(db_session, city, "Not A Slug")


def test_draft_place_may_lack_curated_values(db_session):
    city = create_city(db_session)

    place = create_place(
        db_session,
        city,
        "rough-draft",
        status="draft",
        significance_score=None,
        visit_minutes_exterior=None,
    )

    assert place.id is not None


def test_place_requires_an_existing_city(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "homeless")

    db_session.delete(city)
    with pytest.raises(IntegrityError, match="fk_places_city_id_cities"):
        db_session.flush()
    assert place.slug == "homeless"


def test_only_one_primary_style_per_place(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "two-styles")
    first, second = Style(slug="one", name="One"), Style(slug="two", name="Two")
    db_session.add_all([first, second])
    db_session.flush()
    db_session.add(PlaceStyle(place_id=place.id, style_id=first.id, is_primary=True))
    db_session.flush()
    db_session.add(PlaceStyle(place_id=place.id, style_id=second.id, is_primary=True))

    with pytest.raises(IntegrityError, match="uq_place_styles_one_primary"):
        db_session.flush()


def test_same_tag_cannot_be_linked_twice(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "tagged")
    tag = Tag(slug="dome", name="Dome", category="feature")
    db_session.add(tag)
    db_session.flush()
    db_session.add(PlaceTag(place_id=place.id, tag_id=tag.id))
    db_session.flush()
    db_session.expunge_all()
    db_session.add(PlaceTag(place_id=place.id, tag_id=tag.id))

    with pytest.raises(IntegrityError, match="pk_place_tags"):
        db_session.flush()


def test_tag_category_is_validated(db_session):
    db_session.add(Tag(slug="odd", name="Odd", category="nonsense"))

    with pytest.raises(IntegrityError, match="category_valid"):
        db_session.flush()


def test_architect_in_use_cannot_be_deleted(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "designed")
    architect = Architect(slug="a-one", name="A")
    db_session.add(architect)
    db_session.flush()
    db_session.add(PlaceArchitect(place_id=place.id, architect_id=architect.id))
    db_session.flush()

    db_session.delete(architect)
    with pytest.raises(IntegrityError, match="fk_place_architects_architect_id_architects"):
        db_session.flush()


def test_deleting_a_place_removes_its_dependent_rows(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "doomed")
    architect = Architect(slug="a-one", name="A")
    tag = Tag(slug="dome", name="Dome", category="feature")
    source = make_source(db_session)
    db_session.add_all([architect, tag])
    db_session.flush()
    db_session.add_all(
        [
            PlaceArchitect(place_id=place.id, architect_id=architect.id),
            PlaceTag(place_id=place.id, tag_id=tag.id),
            PlaceFieldSource(place_id=place.id, field_name="year_built", source_id=source.id),
            PlaceImage(
                place_id=place.id,
                storage_path="a.jpg",
                credit="Someone",
                license="CC BY 4.0",
                source_url="https://example.org/a.jpg",
            ),
            OpeningHours(
                place_id=place.id,
                day_of_week=0,
                opens=datetime.time(9),
                closes=datetime.time(17),
            ),
        ]
    )
    db_session.flush()
    db_session.expire_all()

    db_session.delete(place)
    db_session.flush()

    for model in (PlaceArchitect, PlaceTag, PlaceFieldSource, PlaceImage, OpeningHours):
        assert db_session.scalar(select(func.count()).select_from(model)) == 0
    # Shared records survive.
    assert db_session.scalar(select(func.count()).select_from(Architect)) == 1
    assert db_session.scalar(select(func.count()).select_from(Source)) == 1


def test_image_requires_license_metadata(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "pictured")
    db_session.add(
        PlaceImage(
            place_id=place.id,
            storage_path="a.jpg",
            credit="Someone",
            license=None,
            source_url="https://example.org/a.jpg",
        )
    )

    with pytest.raises(IntegrityError, match="license"):
        db_session.flush()


def test_opening_hours_day_must_be_a_weekday_number(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "open")
    db_session.add(
        OpeningHours(
            place_id=place.id, day_of_week=7, opens=datetime.time(9), closes=datetime.time(17)
        )
    )

    with pytest.raises(IntegrityError, match="day_of_week_range"):
        db_session.flush()


def test_source_url_is_unique(db_session):
    make_source(db_session)

    with pytest.raises(IntegrityError, match="uq_sources_url"):
        make_source(db_session)


@pytest.mark.parametrize(
    "field_name", ["significance_score", "visit_minutes_exterior", "visit_minutes_interior"]
)
def test_curated_fields_cannot_have_provenance(db_session, field_name):
    city = create_city(db_session)
    place = create_place(db_session, city, "judged")
    source = make_source(db_session)
    db_session.add(PlaceFieldSource(place_id=place.id, field_name=field_name, source_id=source.id))

    with pytest.raises(IntegrityError, match="field_name"):
        db_session.flush()


def test_one_field_may_have_several_sources_but_not_the_same_twice(db_session):
    city = create_city(db_session)
    place = create_place(db_session, city, "cited")
    first = make_source(db_session, "https://example.org/a")
    second = make_source(db_session, "https://example.org/b")
    db_session.add_all(
        [
            PlaceFieldSource(place_id=place.id, field_name="year_built", source_id=first.id),
            PlaceFieldSource(place_id=place.id, field_name="year_built", source_id=second.id),
        ]
    )
    db_session.flush()
    db_session.expunge_all()
    db_session.add(PlaceFieldSource(place_id=place.id, field_name="year_built", source_id=first.id))

    with pytest.raises(IntegrityError, match="pk_place_field_sources"):
        db_session.flush()
