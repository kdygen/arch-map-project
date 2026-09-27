import pytest

pytestmark = pytest.mark.integration


def slugs(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["slug"] for item in response.json()["items"]]


def get(client, **params):
    return client.get("/api/v1/places", params=params)


class TestPlaceList:
    def test_returns_published_places_most_significant_first(self, seeded_client):
        response = get(seeded_client)

        assert slugs(response) == ["alpha-house", "gamma-tower", "beta-hall"]
        assert response.json()["total"] == 3

    def test_drafts_are_excluded(self, seeded_client):
        assert "delta-draft" not in slugs(get(seeded_client))

    def test_drafts_cannot_be_requested_over_http(self, seeded_client):
        assert get(seeded_client, status="draft").status_code == 422
        assert get(seeded_client, include_unpublished="true").status_code == 422

    def test_item_is_a_lightweight_marker_representation(self, seeded_client):
        item = get(seeded_client).json()["items"][1]

        assert item == {
            "id": item["id"],
            "slug": "gamma-tower",
            "name": "Gamma Tower",
            "latitude": pytest.approx(42.36),
            "longitude": pytest.approx(-71.09),
            "year_built_start": 1968,
            "year_built_end": None,
            "year_is_approximate": False,
            "building_type": {"slug": "tower", "name": "Tower"},
            "primary_style": {"slug": "brutalism", "name": "Brutalism"},
            "architects": [
                {"slug": "b-two", "name": "B. Two", "role": "architect"},
                {"slug": "c-three", "name": "C. Three", "role": "associate architect"},
            ],
            "public_access": "public",
            "admission_type": "free",
            "tours_available": False,
            "significance_score": 4,
            "visit_minutes_exterior": 20,
            "visit_minutes_interior": None,
        }

    def test_item_omits_heavy_fields(self, seeded_client):
        item = get(seeded_client).json()["items"][0]

        assert not {"description", "significance_text", "field_sources", "images"} & item.keys()

    def test_empty_database_returns_empty_list(self, catalog_client):
        assert get(catalog_client).json() == {"items": [], "total": 0, "limit": 100, "offset": 0}


class TestFilters:
    @pytest.mark.parametrize(
        ("params", "expected"),
        [
            ({"architect": "a-one"}, ["alpha-house"]),
            ({"architect": "b-two"}, ["gamma-tower", "beta-hall"]),
            ({"architect": ["a-one", "c-three"]}, ["alpha-house", "gamma-tower"]),
            ({"architect": "nobody"}, []),
            ({"style": "classical"}, ["alpha-house", "gamma-tower"]),
            ({"style": "brutalism"}, ["gamma-tower"]),
            # A parent style also matches places tagged with its sub-styles.
            ({"style": "modernism"}, ["gamma-tower", "beta-hall"]),
            ({"building_type": "tower"}, ["gamma-tower"]),
            ({"building_type": ["tower", "house"]}, ["alpha-house", "gamma-tower", "beta-hall"]),
            ({"period": "old"}, ["alpha-house"]),
            ({"period": "new"}, ["gamma-tower", "beta-hall"]),
            ({"tag": "dome"}, ["alpha-house", "gamma-tower"]),
            ({"tag": "brick"}, ["gamma-tower", "beta-hall"]),
            # Several tags must all be present.
            ({"tag": ["dome", "brick"]}, ["gamma-tower"]),
            ({"public_access": "exterior_only"}, ["beta-hall"]),
            ({"public_access": "public"}, ["alpha-house", "gamma-tower"]),
            (
                {"public_access": ["public", "exterior_only"]},
                ["alpha-house", "gamma-tower", "beta-hall"],
            ),
            ({"admission_type": "paid"}, ["alpha-house"]),
            ({"admission_type": "free"}, ["gamma-tower", "beta-hall"]),
            ({"tours_available": "true"}, ["alpha-house"]),
            ({"year_from": 1960}, ["gamma-tower"]),
            ({"year_to": 1900}, ["alpha-house"]),
            ({"year_from": 1940, "year_to": 1960}, ["beta-hall"]),
            # A construction span matches when any part of it is in range.
            ({"year_from": 1798, "year_to": 1799}, ["alpha-house"]),
            ({"year_from": 1801, "year_to": 1900}, []),
            # Different filters combine with AND.
            ({"architect": "b-two", "tag": "dome"}, ["gamma-tower"]),
            ({"style": "modernism", "public_access": "exterior_only"}, ["beta-hall"]),
            ({"architect": "a-one", "style": "modernism"}, []),
        ],
    )
    def test_filter(self, seeded_client, params, expected):
        response = get(seeded_client, **params)

        assert slugs(response) == expected
        assert response.json()["total"] == len(expected)

    def test_filters_never_reveal_drafts(self, seeded_client):
        assert slugs(get(seeded_client, architect="a-one", year_from=1900)) == []

    @pytest.mark.parametrize(
        "params",
        [
            {"public_access": "sometimes"},
            {"admission_type": "cheap"},
            {"year_from": "old"},
            {"year_from": 2000, "year_to": 1900},
            {"tours_available": "maybe"},
            {"unknown_filter": "x"},
        ],
    )
    def test_invalid_filter_values_are_rejected(self, seeded_client, params):
        assert get(seeded_client, **params).status_code == 422


class TestBoundingBox:
    def test_returns_only_places_in_the_viewport(self, seeded_client):
        response = get(seeded_client, bbox="-71.07,42.35,-71.05,42.37")

        assert slugs(response) == ["alpha-house", "beta-hall"]

    def test_viewport_elsewhere_is_empty(self, seeded_client):
        assert slugs(get(seeded_client, bbox="2.2,48.8,2.4,48.9")) == []

    def test_combines_with_other_filters(self, seeded_client):
        response = get(seeded_client, bbox="-71.07,42.35,-71.05,42.37", tag="brick")

        assert slugs(response) == ["beta-hall"]

    def test_draft_inside_viewport_stays_hidden(self, seeded_client):
        response = get(seeded_client, bbox="-71.0606,42.3604,-71.0604,42.3606")

        assert slugs(response) == []

    @pytest.mark.parametrize(
        "bbox", ["", "1,2,3", "a,b,c,d", "-200,0,0,1", "0,50,1,40", "1,2,3,4,5"]
    )
    def test_malformed_bbox_is_rejected(self, seeded_client, bbox):
        assert get(seeded_client, bbox=bbox).status_code == 422


class TestPagination:
    def test_limit_and_offset_page_through_results(self, seeded_client):
        first = get(seeded_client, limit=2)
        second = get(seeded_client, limit=2, offset=2)

        assert slugs(first) == ["alpha-house", "gamma-tower"]
        assert slugs(second) == ["beta-hall"]
        assert first.json()["total"] == second.json()["total"] == 3
        assert second.json()["limit"] == 2
        assert second.json()["offset"] == 2

    def test_offset_past_the_end_is_empty(self, seeded_client):
        response = get(seeded_client, offset=50)

        assert slugs(response) == []
        assert response.json()["total"] == 3

    @pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 501}, {"offset": -1}])
    def test_out_of_range_paging_is_rejected(self, seeded_client, params):
        assert get(seeded_client, **params).status_code == 422


class TestPlaceDetail:
    def test_returns_complete_details(self, seeded_client):
        response = seeded_client.get("/api/v1/places/gamma-tower")

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Gamma Tower"
        assert body["city"] == {
            "slug": "testville",
            "name": "Testville",
            "region": "Test Region",
            "country_code": "US",
        }
        assert body["timezone"] == "America/New_York"
        assert body["address_line"] == "1 Test Street"
        assert body["period"] == {
            "slug": "new",
            "name": "New",
            "start_year": 1900,
            "end_year": 1999,
        }
        assert [a["slug"] for a in body["architects"]] == ["b-two", "c-three"]
        assert body["styles"] == [
            {"slug": "brutalism", "name": "Brutalism", "is_primary": True},
            {"slug": "classical", "name": "Classical", "is_primary": False},
        ]
        assert body["tags"] == [
            {"slug": "dome", "name": "Dome", "category": "feature"},
            {"slug": "brick", "name": "Brick", "category": "material"},
        ]
        assert body["images"] == []
        assert body["opening_hours"] == []

    def test_curated_values_are_separate_from_sourced_facts(self, seeded_client):
        body = seeded_client.get("/api/v1/places/alpha-house").json()

        assert body["curated"] == {
            "significance_score": 5,
            "visit_minutes_exterior": 15,
            "visit_minutes_interior": 60,
        }
        assert "significance_score" not in body
        sourced_fields = {entry["field_name"] for entry in body["field_sources"]}
        assert not sourced_fields & body["curated"].keys()

    def test_includes_provenance_with_full_source_details(self, seeded_client):
        body = seeded_client.get("/api/v1/places/alpha-house").json()

        entry = next(e for e in body["field_sources"] if e["field_name"] == "year_built")
        assert entry == {
            "field_name": "year_built",
            "note": "Built in 1950",
            "source": {
                "title": "Example reference",
                "url": "https://example.org/reference",
                "publisher": "Example Org",
                "source_type": "official_site",
                "accessed_at": "2026-01-15",
            },
        }
        assert len(body["field_sources"]) == 7

    def test_does_not_leak_internal_fields(self, seeded_client):
        body = seeded_client.get("/api/v1/places/alpha-house").json()

        assert not {"status", "city_id", "location", "google_place_id", "created_at"} & body.keys()

    def test_unknown_slug_returns_404(self, seeded_client):
        response = seeded_client.get("/api/v1/places/nowhere")

        assert response.status_code == 404
        assert response.json() == {"detail": "Place not found"}

    def test_draft_returns_404(self, seeded_client):
        assert seeded_client.get("/api/v1/places/delta-draft").status_code == 404


class TestFilterOptions:
    def test_lists_options_with_counts_of_published_places(self, seeded_client):
        body = seeded_client.get("/api/v1/filters").json()

        assert body["architects"] == [
            {"slug": "a-one", "name": "A. One", "count": 1},
            {"slug": "b-two", "name": "B. Two", "count": 2},
            {"slug": "c-three", "name": "C. Three", "count": 1},
        ]
        assert body["styles"] == [
            {"slug": "brutalism", "name": "Brutalism", "count": 1},
            {"slug": "classical", "name": "Classical", "count": 2},
            {"slug": "modernism", "name": "Modernism", "count": 1},
        ]
        assert body["building_types"] == [
            {"slug": "house", "name": "House", "count": 2},
            {"slug": "tower", "name": "Tower", "count": 1},
        ]
        assert body["periods"] == [
            {"slug": "old", "name": "Old", "count": 1, "start_year": 1700, "end_year": 1899},
            {"slug": "new", "name": "New", "count": 2, "start_year": 1900, "end_year": 1999},
        ]
        assert body["tag_categories"] == [
            {"category": "feature", "tags": [{"slug": "dome", "name": "Dome", "count": 2}]},
            {"category": "material", "tags": [{"slug": "brick", "name": "Brick", "count": 2}]},
        ]
        assert body["public_access"] == [
            {"value": "exterior_only", "count": 1},
            {"value": "public", "count": 2},
        ]
        assert body["admission_types"] == [
            {"value": "free", "count": 2},
            {"value": "paid", "count": 1},
        ]
        assert body["year_built"] == {"min": 1795, "max": 1968}

    def test_empty_database_returns_empty_options(self, catalog_client):
        body = catalog_client.get("/api/v1/filters").json()

        assert body["architects"] == []
        assert body["year_built"] == {"min": None, "max": None}
