"""Validated geographic value types."""

from dataclasses import dataclass


def _check_latitude(value: float, name: str) -> None:
    if not -90 <= value <= 90:
        raise ValueError(f"{name} must be between -90 and 90")


def _check_longitude(value: float, name: str) -> None:
    if not -180 <= value <= 180:
        raise ValueError(f"{name} must be between -180 and 180")


@dataclass(frozen=True)
class Point:
    latitude: float
    longitude: float

    def __post_init__(self) -> None:
        _check_latitude(self.latitude, "latitude")
        _check_longitude(self.longitude, "longitude")


@dataclass(frozen=True)
class BoundingBox:
    """A latitude/longitude rectangle, such as a map viewport.

    `west` may be greater than `east`. That means the box crosses the
    antimeridian at 180 degrees longitude.
    """

    west: float
    south: float
    east: float
    north: float

    def __post_init__(self) -> None:
        _check_longitude(self.west, "west")
        _check_longitude(self.east, "east")
        _check_latitude(self.south, "south")
        _check_latitude(self.north, "north")
        if self.south > self.north:
            raise ValueError("south must not be greater than north")

    @property
    def crosses_antimeridian(self) -> bool:
        return self.west > self.east

    @classmethod
    def parse(cls, raw: str) -> "BoundingBox":
        """Parse "west,south,east,north" in decimal degrees."""
        parts = raw.split(",")
        if len(parts) != 4:
            raise ValueError("bbox must have four comma-separated numbers: west,south,east,north")
        try:
            west, south, east, north = (float(p) for p in parts)
        except ValueError as exc:
            raise ValueError("bbox values must be numbers") from exc
        return cls(west=west, south=south, east=east, north=north)
