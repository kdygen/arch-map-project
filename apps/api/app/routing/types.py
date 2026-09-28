"""Provider-independent routing types."""

from dataclasses import dataclass, field
from enum import StrEnum

from app.geo.types import Point


class TravelMode(StrEnum):
    """Travel modes our API accepts. Walking is the default.

    Adding a mode means adding it here and teaching each provider about it.
    """

    WALKING = "walking"
    DRIVING = "driving"


@dataclass(frozen=True)
class RouteRequest:
    origin: Point
    destination: Point
    travel_mode: TravelMode = TravelMode.WALKING


@dataclass(frozen=True)
class ComputedRoute:
    """A route as returned by a provider. Never persisted."""

    # Google's encoded polyline format, precision 5.
    encoded_polyline: str
    distance_meters: int
    duration_seconds: int
    warnings: list[str] = field(default_factory=list)
