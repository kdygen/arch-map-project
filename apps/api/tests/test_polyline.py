import pytest

from app.geo.types import Point
from app.routing import polyline
from app.routing.polyline import PolylineError
from tests.polyline_helper import encode

# The example from Google's polyline algorithm documentation.
GOOGLE_EXAMPLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
GOOGLE_POINTS = [Point(38.5, -120.2), Point(40.7, -120.95), Point(43.252, -126.453)]


def test_decodes_googles_documented_example():
    assert polyline.decode(GOOGLE_EXAMPLE) == GOOGLE_POINTS


def test_round_trips_with_negative_and_positive_coordinates():
    points = [(42.35834, -71.09415), (-33.86882, 151.20929), (0.00001, -0.00001)]

    decoded = polyline.decode(encode(points))

    assert [(p.latitude, p.longitude) for p in decoded] == points


def test_empty_string_decodes_to_no_points():
    assert polyline.decode("") == []


@pytest.mark.parametrize(
    "encoded",
    [
        "_p~iF",  # a latitude with no longitude
        "_p~iF~ps|",  # ends in the middle of a number
        "hello world",  # a space is outside the alphabet
        "_p~iF\x00ps|U",
        "éééé",
    ],
)
def test_malformed_input_is_rejected(encoded):
    with pytest.raises(PolylineError, match="not a valid encoded polyline"):
        polyline.decode(encoded)


def test_coordinates_out_of_range_are_rejected():
    with pytest.raises(PolylineError, match="out of range"):
        polyline.decode(encode([(10.0, 10.0)]) * 12)


def test_too_many_points_are_rejected():
    many = encode([(42.0 + i * 0.00001, -71.0) for i in range(polyline.MAX_POINTS + 1)])

    with pytest.raises(PolylineError, match="more than 10000 points"):
        polyline.decode(many)


def test_overlong_string_is_rejected_before_decoding():
    with pytest.raises(PolylineError, match="too long"):
        polyline.decode("?" * (polyline.MAX_ENCODED_LENGTH + 1))


class TestValidatedRouteLine:
    def test_accepts_a_normal_walking_route(self):
        line = polyline.validated_route_line(encode([(42.3583, -71.0942), (42.3550, -71.0655)]))

        assert len(line) == 2

    @pytest.mark.parametrize(
        "points",
        [[], [(42.0, -71.0)], [(42.0, -71.0), (42.0, -71.0)], [(42.0, -71.0)] * 5],
    )
    def test_needs_two_different_points(self, points):
        with pytest.raises(PolylineError, match="at least two different points"):
            polyline.validated_route_line(encode(points))

    def test_drops_consecutive_duplicates(self):
        line = polyline.validated_route_line(
            encode([(42.0, -71.0), (42.0, -71.0), (42.001, -71.0), (42.001, -71.0)])
        )

        assert len(line) == 2

    def test_accepts_a_long_driving_route(self):
        # About 440 km, like Boston to Philadelphia.
        line = polyline.validated_route_line(encode([(42.36, -71.06), (39.95, -75.17)]))

        assert len(line) == 2

    def test_rejects_a_line_longer_than_500_km(self):
        with pytest.raises(PolylineError, match="longer than 500 km"):
            polyline.validated_route_line(encode([(42.0, -71.0), (47.0, -71.0)]))


def test_haversine_matches_a_known_distance():
    # One degree of latitude is about 111.2 km.
    distance = polyline.haversine_meters(Point(42.0, -71.0), Point(43.0, -71.0))

    assert distance == pytest.approx(111_195, rel=0.001)


def test_wkt_uses_longitude_latitude_order():
    assert polyline.to_wkt([Point(42.5, -71.25), Point(42.75, -71.5)]) == (
        "LINESTRING(-71.25 42.5, -71.5 42.75)"
    )
