import pytest
from sqlalchemy import select

from app.catalog.models import Place
from app.geo import service as geo
from app.geo.types import BoundingBox, Point
from tests.factories import create_city, create_place


def slugs(session, *conditions):
    return set(session.scalars(select(Place.slug).where(*conditions)))


class TestTypes:
    def test_bounding_box_parses_west_south_east_north(self):
        box = BoundingBox.parse("-71.12,42.34,-71.05,42.37")

        assert box == BoundingBox(west=-71.12, south=42.34, east=-71.05, north=42.37)

    @pytest.mark.parametrize(
        "raw",
        ["", "1,2,3", "1,2,3,4,5", "a,b,c,d", "-181,0,0,1", "0,-91,1,0", "0,10,1,5", "0,0,nan,1"],
    )
    def test_bounding_box_rejects_malformed_input(self, raw):
        with pytest.raises(ValueError):
            BoundingBox.parse(raw)

    def test_west_greater_than_east_means_antimeridian_crossing(self):
        assert BoundingBox.parse("179,-1,-179,1").crosses_antimeridian

    @pytest.mark.parametrize(("lat", "lng"), [(91, 0), (-91, 0), (0, 181), (0, -181)])
    def test_point_rejects_out_of_range_coordinates(self, lat, lng):
        with pytest.raises(ValueError):
            Point(lat, lng)


@pytest.mark.integration
class TestPostgis:
    @pytest.fixture
    def places(self, db_session):
        city = create_city(db_session)
        create_place(db_session, city, "center", 42.3600, -71.0600)
        create_place(db_session, city, "near", 42.3610, -71.0610)
        create_place(db_session, city, "across-town", 42.3600, -71.0900)
        create_place(db_session, city, "fiji-east", -17.0, 179.5)
        create_place(db_session, city, "fiji-west", -17.0, -179.5)
        return db_session

    def test_coordinates_round_trip_in_latitude_longitude_order(self, places):
        place = places.scalars(select(Place).where(Place.slug == "center")).one()

        assert place.latitude == pytest.approx(42.36)
        assert place.longitude == pytest.approx(-71.06)

    def test_bounding_box_returns_only_places_inside(self, places):
        box = BoundingBox(west=-71.07, south=42.35, east=-71.05, north=42.37)

        assert slugs(places, geo.within_bounding_box(Place.location, box)) == {"center", "near"}

    def test_bounding_box_includes_points_on_its_edge(self, places):
        box = BoundingBox(west=-71.06, south=42.36, east=-71.05, north=42.37)

        assert "center" in slugs(places, geo.within_bounding_box(Place.location, box))

    def test_bounding_box_can_cross_the_antimeridian(self, places):
        box = BoundingBox(west=179.0, south=-18.0, east=-179.0, north=-16.0)

        found = slugs(places, geo.within_bounding_box(Place.location, box))

        assert found == {"fiji-east", "fiji-west"}

    def test_whole_world_bounding_box_returns_everything(self, places):
        box = BoundingBox(west=-180, south=-90, east=180, north=90)

        assert len(slugs(places, geo.within_bounding_box(Place.location, box))) == 5

    def test_radius_uses_real_meters(self, places):
        center = Point(42.3600, -71.0600)
        # "near" is about 138 m away. "across-town" is about 2.5 km away.
        assert slugs(places, geo.within_radius(Place.location, center, 100)) == {"center"}
        assert slugs(places, geo.within_radius(Place.location, center, 200)) == {"center", "near"}
        assert slugs(places, geo.within_radius(Place.location, center, 3000)) == {
            "center",
            "near",
            "across-town",
        }

    def test_radius_works_across_the_antimeridian(self, places):
        found = slugs(places, geo.within_radius(Place.location, Point(-17.0, 179.9), 80_000))

        assert found == {"fiji-east", "fiji-west"}

    def test_distance_is_in_meters(self, places):
        distance = places.scalar(
            select(geo.distance_meters(Place.location, Point(42.3600, -71.0600))).where(
                Place.slug == "across-town"
            )
        )

        assert distance == pytest.approx(2470, abs=30)

    @pytest.mark.parametrize("radius", [0, -5, geo.MAX_RADIUS_METERS + 1])
    def test_radius_must_be_in_range(self, radius):
        with pytest.raises(ValueError):
            geo.within_radius(Place.location, Point(0.5, 0.5), radius)

    def test_bounding_box_query_uses_the_spatial_index(self, places):
        places.connection().exec_driver_sql("SET LOCAL enable_seqscan = off")
        box = BoundingBox(west=-71.07, south=42.35, east=-71.05, north=42.37)
        query = select(Place.id).where(geo.within_bounding_box(Place.location, box))
        compiled = query.compile(places.connection(), compile_kwargs={"literal_binds": True})

        plan = "\n".join(
            row[0] for row in places.connection().exec_driver_sql(f"EXPLAIN {compiled}")
        )

        assert "ix_places_location_geometry_gist" in plan

    def test_radius_query_uses_the_spatial_index(self, places):
        places.connection().exec_driver_sql("SET LOCAL enable_seqscan = off")
        query = select(Place.id).where(geo.within_radius(Place.location, Point(42.36, -71.06), 500))
        compiled = query.compile(places.connection(), compile_kwargs={"literal_binds": True})

        plan = "\n".join(
            row[0] for row in places.connection().exec_driver_sql(f"EXPLAIN {compiled}")
        )

        assert "ix_places_location_gist" in plan
