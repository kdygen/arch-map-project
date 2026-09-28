"""Decoding and validation of encoded polylines sent back by the browser.

The nearby-places endpoint receives the route line from the client. The
geometry only shapes a database query, so a forged line can not change any
fact. It is still bounded here, so it can never make that query expensive.
"""

import math

from app.geo.types import Point

MAX_ENCODED_LENGTH = 100_000
MAX_POINTS = 10_000
# Long enough for the longest driving route we accept.
MAX_ROUTE_LENGTH_METERS = 500_000
EARTH_RADIUS_METERS = 6_371_008.8


class PolylineError(ValueError):
    pass


def decode(encoded: str, precision: int = 5) -> list[Point]:
    """Decode Google's encoded polyline format into points."""
    if len(encoded) > MAX_ENCODED_LENGTH:
        raise PolylineError("route line is too long")
    factor = 10**precision
    points: list[Point] = []
    index = latitude = longitude = 0
    length = len(encoded)

    def next_value() -> int:
        nonlocal index
        result = shift = 0
        while True:
            if index >= length:
                raise PolylineError("route line is not a valid encoded polyline")
            byte = ord(encoded[index]) - 63
            index += 1
            if not 0 <= byte < 64:
                raise PolylineError("route line is not a valid encoded polyline")
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        return ~(result >> 1) if result & 1 else result >> 1

    while index < length:
        latitude += next_value()
        longitude += next_value()
        try:
            points.append(Point(latitude / factor, longitude / factor))
        except ValueError as exc:
            raise PolylineError("route line has coordinates out of range") from exc
        if len(points) > MAX_POINTS:
            raise PolylineError(f"route line has more than {MAX_POINTS} points")
    return points


def haversine_meters(a: Point, b: Point) -> float:
    lat1, lat2 = math.radians(a.latitude), math.radians(b.latitude)
    dlat = lat2 - lat1
    dlng = math.radians(b.longitude - a.longitude)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(h))


def line_length_meters(points: list[Point]) -> float:
    return sum(haversine_meters(a, b) for a, b in zip(points, points[1:], strict=False))


def validated_route_line(encoded: str) -> list[Point]:
    """Decode and check a route line before it is used in a query."""
    points = decode(encoded)
    # Consecutive duplicates add nothing and can make a line degenerate.
    distinct = [p for i, p in enumerate(points) if i == 0 or p != points[i - 1]]
    if len(distinct) < 2:
        raise PolylineError("route line needs at least two different points")
    if line_length_meters(distinct) > MAX_ROUTE_LENGTH_METERS:
        raise PolylineError("route line is longer than 500 km")
    return distinct


def to_wkt(points: list[Point]) -> str:
    """Well-known text in longitude-latitude order, as PostGIS expects."""
    coordinates = ", ".join(f"{p.longitude!r} {p.latitude!r}" for p in points)
    return f"LINESTRING({coordinates})"
