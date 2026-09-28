"""Route corridor queries: which points lie near a line, and where along it.

This is proximity, not travel time. A place 150 m from the line may need a
longer walk because of the street layout. Phase 6 measures real detours with
the routing provider.
"""

from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import ColumnElement, cast, func

from app.geo.service import PLAIN_GEOMETRY, SRID

MIN_CORRIDOR_METERS = 25
MAX_CORRIDOR_METERS = 1_000
# About a six-minute walk each way at a comfortable pace. The same default is
# used for every travel mode for now.
DEFAULT_CORRIDOR_METERS = 500


def line_geometry(wkt: str) -> ColumnElement[Any]:
    return func.ST_GeomFromText(wkt, SRID)


def within_corridor(column: Any, line: ColumnElement[Any], meters: float) -> ColumnElement[bool]:
    """True when the point is within `meters` of the line, measured on the spheroid.

    Uses the geography GiST index on the point column.
    """
    if not MIN_CORRIDOR_METERS <= meters <= MAX_CORRIDOR_METERS:
        raise ValueError(
            f"corridor must be between {MIN_CORRIDOR_METERS} and {MAX_CORRIDOR_METERS} meters"
        )
    return func.ST_DWithin(column, cast(line, Geography(srid=SRID)), meters)


def distance_to_line_meters(column: Any, line: ColumnElement[Any]) -> ColumnElement[float]:
    return func.ST_Distance(column, cast(line, Geography(srid=SRID)))


def progress_along_line(column: Any, line: ColumnElement[Any]) -> ColumnElement[float]:
    """Where the closest point of the line lies, from 0 at the start to 1 at the end.

    Computed on longitude and latitude, which is fine for ordering places along
    a route. It is a fraction of the line, not of the travel time.
    """
    return func.ST_LineLocatePoint(line, cast(column, PLAIN_GEOMETRY))
