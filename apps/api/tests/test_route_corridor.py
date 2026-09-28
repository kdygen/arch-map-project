"""Architecture near a route. PostGIS does the work, so these use the real database."""

import pytest

from app.geo import corridor
from tests.factories import create_city, create_place
from tests.polyline_helper import encode

pytestmark = pytest.mark.integration

# A straight west-to-east line along latitude 42.36.
# At this latitude 0.001 degrees of latitude is about 111 m.
WEST, EAST = (42.36, -71.10), (42.36, -71.05)
LINE = encode([WEST, EAST])
REVERSED = encode([EAST, WEST])


def near(client, polyline=LINE, **body):
    return client.post("/api/v1/routes/nearby-places", json={"polyline": polyline, **body})


def slugs(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["place"]["slug"] for item in response.json()["items"]]


@pytest.fixture
def places(db_session, catalog_client):
    city = create_city(db_session)
    #                                      latitude   longitude
    create_place(db_session, city, "start", 42.3600, -71.0990)
    create_place(db_session, city, "middle-north", 42.3610, -71.0750)  # about 111 m north
    create_place(db_session, city, "middle-south", 42.3580, -71.0760)  # about 222 m south
    create_place(db_session, city, "end", 42.3601, -71.0510)
    create_place(db_session, city, "far-north", 42.3650, -71.0750)  # about 555 m north
    create_place(db_session, city, "beyond-the-end", 42.3600, -71.0400)  # 820 m past the end
    create_place(db_session, city, "hidden-draft", 42.3600, -71.0800, status="draft")
    return catalog_client


class TestCorridor:
    def test_returns_places_within_the_default_corridor(self, places):
        response = near(places)

        assert slugs(response) == ["start", "middle-south", "middle-north", "end"]
        assert response.json()["corridor_meters"] == corridor.DEFAULT_CORRIDOR_METERS == 500
        assert response.json()["total"] == 4

    def test_default_corridor_is_500_meters(self, places):
        # middle-south is 222 m away, far-north 555 m. Only the nearer one is in.
        found = slugs(near(places))

        assert "middle-south" in found
        assert "far-north" not in found

    def test_a_wider_corridor_finds_more(self, places):
        assert "far-north" in slugs(near(places, corridor_meters=600))
        assert "far-north" not in slugs(near(places, corridor_meters=500))

    def test_a_narrower_corridor_finds_fewer(self, places):
        assert slugs(near(places, corridor_meters=150)) == ["start", "middle-north", "end"]
        assert slugs(near(places, corridor_meters=300)) == [
            "start",
            "middle-south",
            "middle-north",
            "end",
        ]

    def test_boundary_is_measured_in_real_meters(self, places):
        # middle-north is 111.1 m from the line.
        assert "middle-north" not in slugs(near(places, corridor_meters=110))
        assert "middle-north" in slugs(near(places, corridor_meters=112))

    def test_corridor_covers_the_area_around_the_ends_but_not_far_beyond(self, places):
        assert "beyond-the-end" not in slugs(near(places, corridor_meters=800))
        assert "beyond-the-end" in slugs(near(places, corridor_meters=900))

    def test_reports_distance_from_the_route(self, places):
        items = {i["place"]["slug"]: i for i in near(places).json()["items"]}

        assert items["start"]["distance_from_route_meters"] == 0
        assert items["middle-north"]["distance_from_route_meters"] == pytest.approx(111, abs=2)
        assert items["middle-south"]["distance_from_route_meters"] == pytest.approx(222, abs=2)

    def test_drafts_are_never_returned(self, places):
        assert "hidden-draft" not in slugs(near(places, corridor_meters=1000))

    def test_no_places_near_the_route(self, places):
        response = near(places, polyline=encode([(48.85, 2.34), (48.86, 2.36)]))

        assert response.json()["items"] == []
        assert response.json()["total"] == 0

    def test_follows_a_route_with_a_bend(self, places):
        # West to the middle, then north. far-north is now close to the line.
        bent = encode([WEST, (42.36, -71.075), (42.367, -71.075)])

        found = slugs(near(places, polyline=bent))

        assert "far-north" in found
        assert "end" not in found

    @pytest.mark.parametrize("meters", [0, 10, 24.9, 1000.1, 5000, -300, "wide"])
    def test_corridor_must_be_within_limits(self, places, meters):
        assert near(places, corridor_meters=meters).status_code == 422

    @pytest.mark.parametrize("meters", [25, 1000])
    def test_corridor_limits_are_inclusive(self, places, meters):
        assert near(places, corridor_meters=meters).status_code == 200

    @pytest.mark.parametrize(
        "polyline",
        [
            "",
            "not a polyline!",
            encode([WEST]),
            encode([WEST, WEST]),
            encode([(42, -71), (47, -71)]),
        ],
    )
    def test_invalid_route_lines_are_rejected(self, places, polyline):
        assert near(places, polyline=polyline).status_code == 422

    def test_route_line_is_required_and_unknown_fields_are_rejected(self, places):
        assert places.post("/api/v1/routes/nearby-places", json={}).status_code == 422
        assert near(places, bbox="1,2,3,4").status_code == 422

    def test_limit_caps_the_list_but_not_the_total(self, places):
        response = near(places, limit=2)

        assert slugs(response) == ["start", "middle-south"]
        assert response.json()["total"] == 4


class TestProgressOrder:
    def test_places_are_ordered_along_the_route_not_by_distance_from_it(self, places):
        items = near(places).json()["items"]

        progress = [i["route_progress"] for i in items]
        assert progress == sorted(progress)
        assert [i["place"]["slug"] for i in items] == [
            "start",
            "middle-south",
            "middle-north",
            "end",
        ]

    def test_progress_runs_from_zero_to_one(self, places):
        items = {i["place"]["slug"]: i["route_progress"] for i in near(places).json()["items"]}

        assert items["start"] == pytest.approx(0.02, abs=0.001)
        assert items["middle-south"] == pytest.approx(0.48, abs=0.001)
        assert items["middle-north"] == pytest.approx(0.50, abs=0.001)
        assert items["end"] == pytest.approx(0.98, abs=0.001)

    def test_reversing_the_route_reverses_the_order(self, places):
        assert slugs(near(places, polyline=REVERSED)) == [
            "end",
            "middle-north",
            "middle-south",
            "start",
        ]

    def test_places_past_an_end_get_progress_zero_or_one(self, places):
        items = {
            i["place"]["slug"]: i["route_progress"]
            for i in near(places, corridor_meters=900).json()["items"]
        }

        assert items["beyond-the-end"] == 1.0

    def test_equal_progress_is_ordered_by_distance_from_the_route(self, db_session, catalog_client):
        city = create_city(db_session)
        # All three project onto the same point of the line.
        create_place(db_session, city, "tie-far", 42.3620, -71.0750, name="Alpha")
        create_place(db_session, city, "tie-near", 42.3605, -71.0750, name="Zulu")
        create_place(db_session, city, "tie-middle", 42.3590, -71.0750, name="Mike")

        first = slugs(near(catalog_client))
        second = slugs(near(catalog_client))

        assert first == second == ["tie-near", "tie-middle", "tie-far"]

    def test_places_at_the_same_point_are_ordered_by_name_then_id(self, db_session, catalog_client):
        city = create_city(db_session)
        for slug, name in [("same-b", "Same"), ("same-a", "Same"), ("same-c", "Other")]:
            create_place(db_session, city, slug, 42.3605, -71.0750, name=name)

        results = [slugs(near(catalog_client)) for _ in range(3)]

        assert results[0] == results[1] == results[2]
        assert results[0][0] == "same-c"


class TestFilters:
    # The seeded fixture places: alpha-house and beta-hall near -71.06, gamma-tower at -71.09.
    LINE = encode([(42.36, -71.10), (42.36, -71.05)])

    def near(self, client, **filters):
        return near(client, polyline=self.LINE, filters=filters)

    def test_without_filters(self, seeded_client):
        assert slugs(self.near(seeded_client)) == ["gamma-tower", "beta-hall", "alpha-house"]

    @pytest.mark.parametrize(
        ("filters", "expected"),
        [
            ({"style": ["modernism"]}, ["gamma-tower", "beta-hall"]),
            ({"style": ["classical"]}, ["gamma-tower", "alpha-house"]),
            ({"architect": ["a-one"]}, ["alpha-house"]),
            ({"building_type": ["tower"]}, ["gamma-tower"]),
            ({"period": ["old"]}, ["alpha-house"]),
            ({"tag": ["dome", "brick"]}, ["gamma-tower"]),
            ({"public_access": ["exterior_only"]}, ["beta-hall"]),
            ({"admission_type": ["paid"]}, ["alpha-house"]),
            ({"tours_available": True}, ["alpha-house"]),
            ({"year_from": 1960}, ["gamma-tower"]),
            ({"q": "two"}, ["gamma-tower", "beta-hall"]),
            ({"q": "  TWO  ", "public_access": ["public"]}, ["gamma-tower"]),
            ({"q": "zeppelin"}, []),
            ({"style": ["modernism"], "architect": ["a-one"]}, []),
        ],
    )
    def test_catalog_filters_narrow_the_route_results(self, seeded_client, filters, expected):
        response = self.near(seeded_client, **filters)

        assert slugs(response) == expected
        assert response.json()["total"] == len(expected)

    def test_filters_never_reveal_drafts(self, seeded_client):
        assert "delta-draft" not in slugs(self.near(seeded_client, q="delta"))

    @pytest.mark.parametrize(
        "filters",
        [
            {"public_access": ["sometimes"]},
            {"year_from": 2000, "year_to": 1900},
            {"bbox": "1,2,3,4"},
            {"limit": 5},
            {"unknown": 1},
        ],
    )
    def test_invalid_filters_are_rejected(self, seeded_client, filters):
        assert self.near(seeded_client, **filters).status_code == 422

    def test_result_is_a_lightweight_summary(self, seeded_client):
        item = self.near(seeded_client).json()["items"][0]

        assert set(item) == {"place", "distance_from_route_meters", "route_progress"}
        assert item["place"]["slug"] == "gamma-tower"
        assert "description" not in item["place"]


def test_corridor_query_uses_the_spatial_index(db_session, catalog_client):
    from sqlalchemy import select

    from app.catalog.models import Place

    city = create_city(db_session)
    create_place(db_session, city, "one", 42.36, -71.075)
    connection = db_session.connection()
    connection.exec_driver_sql("SET LOCAL enable_seqscan = off")
    line = corridor.line_geometry("LINESTRING(-71.10 42.36, -71.05 42.36)")
    query = select(Place.id).where(corridor.within_corridor(Place.location, line, 300))
    compiled = query.compile(connection, compile_kwargs={"literal_binds": True})

    plan = "\n".join(row[0] for row in connection.exec_driver_sql(f"EXPLAIN {compiled}"))

    assert "ix_places_location_gist" in plan


def test_no_routing_provider_is_needed_for_corridor_search(db_session, catalog_client):
    """The guard fixture would fail this test if the endpoint touched the provider."""
    create_place(db_session, create_city(db_session), "one", 42.36, -71.075)

    assert slugs(near(catalog_client)) == ["one"]
