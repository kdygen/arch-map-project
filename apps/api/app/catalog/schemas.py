"""Explicit API response models. ORM models are never returned directly."""

import uuid
from datetime import date, time
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.catalog.enums import AdmissionType, PublicAccess, SourceType, TagCategory


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class NamedRef(ApiModel):
    slug: str
    name: str


class ArchitectRef(NamedRef):
    role: str


class StyleRef(NamedRef):
    is_primary: bool


class TagRef(NamedRef):
    category: TagCategory


class PeriodRef(NamedRef):
    start_year: int | None
    end_year: int | None


class CityRef(NamedRef):
    region: str | None
    country_code: str


class PlaceSummary(ApiModel):
    """Lightweight representation for map markers and lists."""

    id: uuid.UUID
    slug: str
    name: str
    latitude: float
    longitude: float
    year_built_start: int | None
    year_built_end: int | None
    year_is_approximate: bool
    building_type: NamedRef | None
    primary_style: NamedRef | None
    architects: list[ArchitectRef]
    public_access: PublicAccess
    admission_type: AdmissionType
    tours_available: bool | None
    significance_score: int | None
    visit_minutes_exterior: int | None
    visit_minutes_interior: int | None


class PlaceListResponse(ApiModel):
    items: list[PlaceSummary]
    total: int
    limit: int
    offset: int


class SourceOut(ApiModel):
    title: str
    url: str
    publisher: str
    source_type: SourceType
    accessed_at: date


class FieldSourceOut(ApiModel):
    field_name: str
    note: str | None
    source: SourceOut


class ImageOut(ApiModel):
    storage_path: str
    credit: str
    license: str
    source_url: str
    sort_order: int


class OpeningHoursOut(ApiModel):
    day_of_week: int
    opens: time
    closes: time
    valid_from: date | None
    valid_to: date | None


class CuratedOut(ApiModel):
    """Our own product judgments. These are not sourced historical facts."""

    significance_score: int | None
    visit_minutes_exterior: int | None
    visit_minutes_interior: int | None


class PlaceDetail(ApiModel):
    id: uuid.UUID
    slug: str
    name: str
    latitude: float
    longitude: float
    address_line: str | None
    city: CityRef
    country_code: str
    timezone: str
    year_built_start: int | None
    year_built_end: int | None
    year_is_approximate: bool
    building_type: NamedRef | None
    period: PeriodRef | None
    architects: list[ArchitectRef]
    styles: list[StyleRef]
    tags: list[TagRef]
    description: str | None
    significance_text: str | None
    public_access: PublicAccess
    admission_type: AdmissionType
    admission_notes: str | None
    reservation_required: bool | None
    tours_available: bool | None
    accessibility: dict[str, Any] | None
    website_url: str | None
    images: list[ImageOut]
    opening_hours: list[OpeningHoursOut]
    curated: CuratedOut
    field_sources: list[FieldSourceOut]


class FilterOption(ApiModel):
    slug: str
    name: str
    count: int


class PeriodOption(FilterOption):
    start_year: int | None
    end_year: int | None


class TagCategoryOptions(ApiModel):
    category: TagCategory
    tags: list[FilterOption]


class ValueOption(ApiModel):
    value: str
    count: int


class YearRange(ApiModel):
    min: int | None
    max: int | None


class FiltersResponse(ApiModel):
    architects: list[FilterOption]
    styles: list[FilterOption]
    periods: list[PeriodOption]
    building_types: list[FilterOption]
    tag_categories: list[TagCategoryOptions]
    public_access: list[ValueOption]
    admission_types: list[ValueOption]
    year_built: YearRange


class RoutePlace(ApiModel):
    """A place near a route, with where it lies relative to the route.

    These are straight-line measurements, not walking detours.
    """

    place: PlaceSummary
    # Shortest straight-line distance from the place to the route line.
    distance_from_route_meters: int
    # Position of the nearest point on the route, from 0 (origin) to 1 (destination).
    route_progress: float


class RoutePlacesResponse(ApiModel):
    items: list[RoutePlace]
    total: int
    corridor_meters: float
