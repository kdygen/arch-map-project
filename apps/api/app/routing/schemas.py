"""Request and response models for the routing endpoints."""

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.catalog.router import CatalogFilters
from app.geo import corridor
from app.geo.types import Point
from app.routing import polyline
from app.routing.types import TravelMode

# Routes between points farther apart than this, in a straight line, are
# refused before they reach the paid routing provider.
MAX_STRAIGHT_LINE_METERS = {
    TravelMode.WALKING: 50_000,
    TravelMode.DRIVING: 300_000,
}


class LatLng(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

    def to_point(self) -> Point:
        return Point(self.lat, self.lng)


class RouteRequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: LatLng
    destination: LatLng
    travel_mode: TravelMode = TravelMode.WALKING

    @model_validator(mode="after")
    def endpoints_are_sensible(self) -> Self:
        origin, destination = self.origin.to_point(), self.destination.to_point()
        if origin == destination:
            raise ValueError("origin and destination must be different places")
        limit = MAX_STRAIGHT_LINE_METERS[self.travel_mode]
        if polyline.haversine_meters(origin, destination) > limit:
            raise ValueError(
                f"origin and destination are too far apart for a {self.travel_mode} route"
            )
        return self


class RouteOut(BaseModel):
    polyline: str = Field(description="Google encoded polyline, precision 5.")
    distance_meters: int
    duration_seconds: int
    travel_mode: TravelMode
    warnings: list[str]


class RouteResponse(BaseModel):
    route: RouteOut


class NearbyPlacesBody(BaseModel):
    """The route line plus the same search and filters as the place list."""

    model_config = ConfigDict(extra="forbid")

    polyline: str = Field(
        min_length=1,
        max_length=polyline.MAX_ENCODED_LENGTH,
        description="The route line from POST /routes.",
    )
    corridor_meters: float = Field(
        default=corridor.DEFAULT_CORRIDOR_METERS,
        ge=corridor.MIN_CORRIDOR_METERS,
        le=corridor.MAX_CORRIDOR_METERS,
        description="Straight-line distance from the route. Not a detour time.",
    )
    filters: CatalogFilters = Field(default_factory=CatalogFilters)
    limit: int = Field(default=100, ge=1, le=500)

    @field_validator("polyline")
    @classmethod
    def polyline_is_a_valid_route(cls, value: str) -> str:
        polyline.validated_route_line(value)
        return value
