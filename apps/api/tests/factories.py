"""Direct database helpers for tests that do not go through the seed pipeline."""

from typing import Any

from sqlalchemy.orm import Session

from app.catalog.models import City, Place
from app.geo.service import point_wkt
from app.geo.types import Point


def create_city(session: Session, slug: str = "testville") -> City:
    city = City(slug=slug, name=slug.title(), country_code="US")
    session.add(city)
    session.flush()
    return city


def create_place(
    session: Session,
    city: City,
    slug: str,
    latitude: float = 42.36,
    longitude: float = -71.06,
    **overrides: Any,
) -> Place:
    values: dict[str, Any] = {
        "name": slug.title(),
        "status": "published",
        "country_code": "US",
        "timezone": "America/New_York",
        "significance_score": 3,
        "visit_minutes_exterior": 10,
    }
    values.update(overrides)
    place = Place(
        slug=slug,
        city_id=city.id,
        location=point_wkt(Point(latitude, longitude)),
        **values,
    )
    session.add(place)
    session.flush()
    return place
