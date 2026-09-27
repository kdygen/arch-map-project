"""Validation models for seed files.

Seed data lives in human-readable JSON under `data/seed/`. Every record is
validated with these models before anything touches the database.
"""

from datetime import date, time
from typing import Annotated, Any, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from app.catalog.enums import (
    CURATED_FIELDS,
    SOURCEABLE_FIELDS,
    AdmissionType,
    PlaceStatus,
    PublicAccess,
    SourceType,
    TagCategory,
)

Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=120)]
Text = Annotated[str, Field(min_length=1)]
CountryCode = Annotated[str, Field(pattern=r"^[A-Z]{2}$")]
Year = Annotated[int, Field(ge=-3000, le=2100)]
Minutes = Annotated[int, Field(gt=0, le=600)]


class SeedModel(BaseModel):
    # Unknown keys are errors, so typos never pass silently.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Coordinates(SeedModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @model_validator(mode="after")
    def not_null_island(self) -> Self:
        if self.latitude == 0 and self.longitude == 0:
            raise ValueError("coordinates 0,0 are almost certainly a mistake")
        return self


class CitySeed(SeedModel):
    slug: Slug
    name: Text
    region: str | None = None
    country_code: CountryCode
    center: Coordinates | None = None


class PeriodSeed(SeedModel):
    slug: Slug
    name: Text
    start_year: Year | None = None
    end_year: Year | None = None

    @model_validator(mode="after")
    def years_ordered(self) -> Self:
        if self.start_year is not None and self.end_year is not None:
            if self.end_year < self.start_year:
                raise ValueError("end_year must not be before start_year")
        return self


class BuildingTypeSeed(SeedModel):
    slug: Slug
    name: Text


class StyleSeed(SeedModel):
    slug: Slug
    name: Text
    parent: Slug | None = None


class TagSeed(SeedModel):
    slug: Slug
    name: Text
    category: TagCategory


class ArchitectSeed(SeedModel):
    slug: Slug
    name: Text
    birth_year: Year | None = None
    death_year: Year | None = None
    bio: str | None = None


class TaxonomySeed(SeedModel):
    cities: list[CitySeed] = []
    periods: list[PeriodSeed] = []
    building_types: list[BuildingTypeSeed] = []
    styles: list[StyleSeed] = []
    tags: list[TagSeed] = []
    architects: list[ArchitectSeed] = []


class YearBuiltSeed(SeedModel):
    start: Year
    end: Year | None = None
    is_approximate: bool = False

    @model_validator(mode="after")
    def years_ordered(self) -> Self:
        if self.end is not None and self.end < self.start:
            raise ValueError("end must not be before start")
        return self


class PlaceArchitectSeed(SeedModel):
    architect: Slug
    role: Annotated[str, Field(min_length=1, max_length=100)] = "architect"


class PlaceStyleSeed(SeedModel):
    style: Slug
    is_primary: bool = False


class AdmissionSeed(SeedModel):
    type: AdmissionType = AdmissionType.UNKNOWN
    notes: str | None = None


class CuratedSeed(SeedModel):
    """Our own product judgments. They are not facts and have no sources."""

    significance_score: int | None = Field(default=None, ge=1, le=5)
    visit_minutes_exterior: Minutes | None = None
    visit_minutes_interior: Minutes | None = None


class ImageSeed(SeedModel):
    storage_path: Text
    credit: Text
    license: Text
    source_url: HttpUrl
    sort_order: int = Field(default=0, ge=0)


class OpeningHoursSeed(SeedModel):
    day_of_week: int = Field(ge=0, le=6, description="0 is Monday, 6 is Sunday")
    opens: time
    closes: time
    valid_from: date | None = None
    valid_to: date | None = None


class SourceSeed(SeedModel):
    key: Annotated[str, Field(min_length=1, max_length=60)]
    title: Text
    url: HttpUrl
    publisher: Text
    source_type: SourceType
    accessed_at: date

    @field_validator("accessed_at")
    @classmethod
    def not_in_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("accessed_at must not be in the future")
        return value


class ProvenanceSeed(SeedModel):
    field: str
    source: str
    note: str | None = None

    @field_validator("field")
    @classmethod
    def field_is_sourceable(cls, value: str) -> str:
        if value in CURATED_FIELDS:
            raise ValueError(f"'{value}' is a curated product field and must not have a source")
        if value not in SOURCEABLE_FIELDS:
            allowed = ", ".join(sorted(SOURCEABLE_FIELDS))
            raise ValueError(f"'{value}' is not a sourceable field. Allowed: {allowed}")
        return value


class PlaceSeed(SeedModel):
    slug: Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=160)]
    name: Text
    status: PlaceStatus = PlaceStatus.DRAFT
    location: Coordinates
    address_line: str | None = None
    city: Slug
    country_code: CountryCode
    timezone: str
    year_built: YearBuiltSeed | None = None
    building_type: Slug | None = None
    period: Slug | None = None
    architects: list[PlaceArchitectSeed] = []
    styles: list[PlaceStyleSeed] = []
    tags: list[Slug] = []
    description: str | None = None
    significance_text: str | None = None
    public_access: PublicAccess = PublicAccess.UNKNOWN
    admission: AdmissionSeed = AdmissionSeed()
    reservation_required: bool | None = None
    tours_available: bool | None = None
    accessibility: dict[str, Any] | None = None
    website_url: HttpUrl | None = None
    google_place_id: str | None = None
    curated: CuratedSeed = CuratedSeed()
    images: list[ImageSeed] = []
    opening_hours: list[OpeningHoursSeed] = []
    sources: list[SourceSeed] = []
    provenance: list[ProvenanceSeed] = []

    @field_validator("timezone")
    @classmethod
    def timezone_exists(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"'{value}' is not a known IANA timezone") from exc
        return value

    @model_validator(mode="after")
    def internally_consistent(self) -> Self:
        errors: list[str] = []

        def duplicates(values: list[Any]) -> list[Any]:
            return sorted({v for v in values if values.count(v) > 1}, key=str)

        for label, values in (
            ("architect and role", [(a.architect, a.role) for a in self.architects]),
            ("style", [s.style for s in self.styles]),
            ("tag", list(self.tags)),
            ("source key", [s.key for s in self.sources]),
            ("source url", [str(s.url) for s in self.sources]),
            ("provenance entry", [(p.field, p.source) for p in self.provenance]),
            ("image storage_path", [i.storage_path for i in self.images]),
        ):
            for value in duplicates(values):
                errors.append(f"duplicate {label}: {value}")

        if self.styles and sum(s.is_primary for s in self.styles) != 1:
            errors.append("exactly one style must have is_primary set to true")

        source_keys = {s.key for s in self.sources}
        used_keys = {p.source for p in self.provenance}
        for key in sorted(used_keys - source_keys):
            errors.append(f"provenance refers to unknown source key '{key}'")
        for key in sorted(source_keys - used_keys):
            errors.append(f"source '{key}' is defined but supports no field")

        if self.status == PlaceStatus.PUBLISHED:
            errors.extend(self._publication_errors())

        if errors:
            raise ValueError("; ".join(errors))
        return self

    def _publication_errors(self) -> list[str]:
        """A published place needs curated values and sources for its key facts."""
        errors: list[str] = []
        if self.curated.significance_score is None:
            errors.append("a published place needs curated.significance_score")
        if self.curated.visit_minutes_exterior is None:
            errors.append("a published place needs curated.visit_minutes_exterior")

        sourced = {p.field for p in self.provenance}
        required = {
            "location": True,
            "architects": bool(self.architects),
            "styles": bool(self.styles),
            "year_built": self.year_built is not None,
            "public_access": self.public_access != PublicAccess.UNKNOWN,
            "admission": self.admission.type != AdmissionType.UNKNOWN,
            "tours_available": self.tours_available is not None,
            "reservation_required": self.reservation_required is not None,
            "description": self.description is not None,
            "significance_text": self.significance_text is not None,
        }
        for field_name, is_claimed in required.items():
            if is_claimed and field_name not in sourced:
                errors.append(f"'{field_name}' is claimed but has no provenance entry")
        return errors
