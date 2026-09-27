"""Seed validation. None of these tests need a database."""

import json

import pytest

from app.seeding.loader import SeedValidationError, load_seed
from tests.seed_fixture import TAXONOMY, default_places, make_place, write_seed


def issues_for(tmp_path, places=None, taxonomy=None) -> list[str]:
    write_seed(tmp_path, places, taxonomy)
    with pytest.raises(SeedValidationError) as error:
        load_seed(tmp_path)
    return [str(issue) for issue in error.value.issues]


def place(**overrides):
    return make_place("test-place", 42.36, -71.06, **overrides)


def test_valid_seed_loads(seed_dir):
    data = load_seed(seed_dir)

    assert [p.slug for p in data.places] == [
        "alpha-house",
        "beta-hall",
        "delta-draft",
        "gamma-tower",
    ]
    assert len(data.taxonomy.architects) == 3


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"location": {"latitude": 95, "longitude": 0}}, "location.latitude"),
        ({"location": {"latitude": 0, "longitude": 200}}, "location.longitude"),
        ({"location": {"latitude": 0, "longitude": 0}}, "almost certainly a mistake"),
        ({"location": {"latitude": "north", "longitude": 1}}, "location.latitude"),
        ({"name": ""}, "name"),
        ({"status": "live"}, "status"),
        ({"public_access": "sometimes"}, "public_access"),
        ({"admission": {"type": "cheap"}}, "admission.type"),
        ({"timezone": "Mars/Olympus"}, "not a known IANA timezone"),
        ({"country_code": "usa"}, "country_code"),
        ({"year_built": {"start": 1900, "end": 1800}}, "end must not be before start"),
        ({"website_url": "not a url"}, "website_url"),
        ({"unexpected_key": 1}, "unexpected_key"),
        ({"curated": {"significance_score": 6, "visit_minutes_exterior": 5}}, "significance_score"),
        ({"curated": {"significance_score": 3, "visit_minutes_exterior": 0}}, "visit_minutes"),
        ({"curated": {"visit_minutes_exterior": 5}}, "needs curated.significance_score"),
        ({"curated": {"significance_score": 3}}, "needs curated.visit_minutes_exterior"),
    ],
)
def test_malformed_place_is_rejected(tmp_path, overrides, expected):
    issues = issues_for(tmp_path, [place(**overrides)])

    assert any(expected in issue for issue in issues), issues


def test_missing_required_field_is_rejected(tmp_path):
    record = place()
    del record["location"]

    issues = issues_for(tmp_path, [record])

    assert any("location" in issue and "Field required" in issue for issue in issues)


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"city": "atlantis"}, "'atlantis' is not defined in taxonomy.json cities"),
        ({"building_type": "igloo"}, "'igloo' is not defined in taxonomy.json building_types"),
        ({"architects": [{"architect": "nobody"}]}, "'nobody' is not defined"),
        ({"styles": [{"style": "rococo", "is_primary": True}]}, "'rococo' is not defined"),
        ({"tags": ["moat"]}, "'moat' is not defined in taxonomy.json tags"),
        ({"period": "old"}, "year_built does not overlap period 'old'"),
        ({"country_code": "CA"}, "does not match city country US"),
    ],
)
def test_unknown_references_are_rejected(tmp_path, overrides, expected):
    issues = issues_for(tmp_path, [place(**overrides)])

    assert any(expected in issue for issue in issues), issues


def test_duplicates_inside_a_place_are_rejected(tmp_path):
    issues = issues_for(
        tmp_path,
        [place(tags=["dome", "dome"], architects=[{"architect": "a-one"}] * 2)],
    )

    assert any("duplicate tag: dome" in issue for issue in issues)
    assert any("duplicate architect and role" in issue for issue in issues)


@pytest.mark.parametrize(
    "styles",
    [
        [{"style": "modernism", "is_primary": False}],
        [{"style": "modernism", "is_primary": True}, {"style": "classical", "is_primary": True}],
    ],
)
def test_exactly_one_primary_style_is_required(tmp_path, styles):
    issues = issues_for(tmp_path, [place(styles=styles)])

    assert any("exactly one style must have is_primary" in issue for issue in issues)


class TestProvenance:
    @pytest.mark.parametrize(
        "field", ["significance_score", "visit_minutes_exterior", "visit_minutes_interior"]
    )
    def test_curated_fields_must_not_have_sources(self, tmp_path, field):
        record = place()
        record["provenance"].append({"field": field, "source": "main"})

        issues = issues_for(tmp_path, [record])

        assert any("curated product field and must not have a source" in i for i in issues)

    def test_unknown_field_name_is_rejected(self, tmp_path):
        record = place()
        record["provenance"].append({"field": "favourite_colour", "source": "main"})

        issues = issues_for(tmp_path, [record])

        assert any("is not a sourceable field" in issue for issue in issues)

    def test_unknown_source_key_is_rejected(self, tmp_path):
        record = place()
        record["provenance"].append({"field": "name", "source": "ghost"})

        issues = issues_for(tmp_path, [record])

        assert any("unknown source key 'ghost'" in issue for issue in issues)

    def test_unused_source_is_rejected(self, tmp_path):
        record = place()
        record["sources"].append(
            {**record["sources"][0], "key": "spare", "url": "https://example.org/spare"}
        )

        issues = issues_for(tmp_path, [record])

        assert any("source 'spare' is defined but supports no field" in i for i in issues)

    @pytest.mark.parametrize(
        "field", ["location", "architects", "styles", "year_built", "public_access", "admission"]
    )
    def test_published_place_needs_sources_for_key_claims(self, tmp_path, field):
        record = place()
        record["provenance"] = [p for p in record["provenance"] if p["field"] != field]

        issues = issues_for(tmp_path, [record])

        assert any(f"'{field}' is claimed but has no provenance entry" in i for i in issues)

    def test_draft_place_may_lack_sources(self, tmp_path):
        write_seed(tmp_path, [place(status="draft", sources=[], provenance=[], curated={})])

        assert load_seed(tmp_path).places[0].status == "draft"

    def test_source_needs_a_valid_url_and_date(self, tmp_path):
        record = place()
        record["sources"][0]["url"] = "somewhere"
        record["sources"][0]["accessed_at"] = "2999-01-01"

        issues = issues_for(tmp_path, [record])

        assert any("sources.0.url" in issue for issue in issues)
        assert any("must not be in the future" in issue for issue in issues)

    def test_same_source_url_must_have_the_same_details_everywhere(self, tmp_path):
        first = make_place("first-place", 42.36, -71.06)
        second = make_place("second-place", 42.37, -71.07)
        second["sources"][0]["title"] = "A different title"

        issues = issues_for(tmp_path, [first, second])

        assert any("same url as a source in places/first-place.json" in i for i in issues)


def test_file_name_must_match_slug(tmp_path):
    write_seed(tmp_path, [place()])
    (tmp_path / "places" / "test-place.json").rename(tmp_path / "places" / "other.json")

    with pytest.raises(SeedValidationError) as error:
        load_seed(tmp_path)

    assert "file must be named test-place.json" in str(error.value.issues[0])


def test_invalid_json_is_reported_with_its_file(tmp_path):
    write_seed(tmp_path, [place()])
    (tmp_path / "places" / "broken.json").write_text("{ not json")

    with pytest.raises(SeedValidationError) as error:
        load_seed(tmp_path)

    assert any(
        "places/broken.json" in str(i) and "invalid JSON" in str(i) for i in error.value.issues
    )


def test_missing_taxonomy_file_is_reported(tmp_path):
    with pytest.raises(SeedValidationError) as error:
        load_seed(tmp_path)

    assert "taxonomy.json: file not found" in str(error.value.issues[0])


def test_taxonomy_record_with_bad_slug_is_rejected(tmp_path):
    taxonomy = json.loads(json.dumps(TAXONOMY))
    taxonomy["tags"].append({"slug": "Bad Slug", "name": "Bad", "category": "feature"})

    issues = issues_for(tmp_path, taxonomy=taxonomy)

    assert any("tags.2.slug" in issue for issue in issues)


def test_taxonomy_cross_checks(tmp_path):
    taxonomy = json.loads(json.dumps(TAXONOMY))
    taxonomy["architects"].append({"slug": "a-one", "name": "Duplicate"})
    taxonomy["styles"].append({"slug": "orphan", "name": "Orphan", "parent": "missing"})
    taxonomy["styles"].append({"slug": "loop-a", "name": "A", "parent": "loop-b"})
    taxonomy["styles"].append({"slug": "loop-b", "name": "B", "parent": "loop-a"})

    issues = issues_for(tmp_path, taxonomy=taxonomy)

    assert any("duplicate slug 'a-one'" in issue for issue in issues)
    assert any("unknown parent style 'missing'" in issue for issue in issues)
    assert any("style parents form a cycle" in issue for issue in issues)


def test_every_problem_is_reported_not_just_the_first(tmp_path):
    places = default_places()
    places[0]["status"] = "live"
    places[1]["city"] = "atlantis"
    places[2]["tags"] = ["moat"]

    issues = issues_for(tmp_path, places)

    assert len(issues) == 3
    assert {issue.split(" ")[0].rstrip(":") for issue in issues} == {
        "places/alpha-house.json",
        "places/beta-hall.json",
        "places/gamma-tower.json",
    }
