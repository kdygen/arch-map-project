"""Geographic query building blocks.

All PostGIS expressions live here, so other modules never write spatial SQL.
Each function returns a SQLAlchemy expression for a geography(Point) column.
Phase 5 adds route corridor search on top of the same foundation.
"""

from typing import Any

from geoalchemy2 import Geography, Geometry
from sqlalchemy import ColumnElement, cast, func, or_

from app.geo.types import BoundingBox, Point

SRID = 4326
# A plain cast with no type modifier. It must render exactly as `location::geometry`,
# or PostgreSQL will not match it to the expression index on places.
PLAIN_GEOMETRY = Geometry(geometry_type=None)
MAX_RADIUS_METERS = 100_000


def make_point(point: Point) -> ColumnElement[Any]:
    """A geography point. PostGIS takes longitude first."""
    return cast(
        func.ST_SetSRID(func.ST_MakePoint(point.longitude, point.latitude), SRID),
        Geography(srid=SRID),
    )


def point_wkt(point: Point) -> str:
    """Extended well-known text for inserting a point."""
    return f"SRID={SRID};POINT({point.longitude} {point.latitude})"


def within_bounding_box(column: Any, box: BoundingBox) -> ColumnElement[bool]:
    """True when the point lies inside the latitude/longitude rectangle.

    Uses the geometry index on `(location::geometry)`. Geometry is correct
    here because a map viewport is a rectangle in degrees, not a geodesic shape.
    """
    geometry = cast(column, PLAIN_GEOMETRY)

    def envelope(west: float, east: float) -> ColumnElement[bool]:
        return geometry.op("&&")(func.ST_MakeEnvelope(west, box.south, east, box.north, SRID))

    if box.crosses_antimeridian:
        return or_(envelope(box.west, 180), envelope(-180, box.east))
    return envelope(box.west, box.east)


def within_radius(column: Any, center: Point, radius_meters: float) -> ColumnElement[bool]:
    """True when the point is within `radius_meters` of `center`.

    Uses the geography index, so the distance is in real meters on the spheroid.
    """
    if not 0 < radius_meters <= MAX_RADIUS_METERS:
        raise ValueError(f"radius_meters must be between 0 and {MAX_RADIUS_METERS}")
    return func.ST_DWithin(column, make_point(center), radius_meters)


def distance_meters(column: Any, center: Point) -> ColumnElement[float]:
    """Distance in meters from `center`, for ordering or display."""
    return func.ST_Distance(column, make_point(center))
