"""SQLAlchemy models for the architecture catalog."""

import uuid
from datetime import date, datetime, time
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    cast,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.catalog.enums import (
    CURATED_FIELDS,
    SOURCEABLE_FIELDS,
    AdmissionType,
    PlaceStatus,
    PublicAccess,
    SourceType,
    TagCategory,
    sql_in,
)
from app.core.db import Base
from app.geo.service import PLAIN_GEOMETRY

SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$"


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))


def point_column(nullable: bool) -> Mapped[Any]:
    # Indexes are declared explicitly in __table_args__, so the automatic one is off.
    return mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=nullable,
    )


def slug_check(table: str) -> CheckConstraint:
    return CheckConstraint(f"slug ~ '{SLUG_PATTERN}'", name="slug_format")


class City(Base):
    __tablename__ = "cities"
    __table_args__ = (
        slug_check("cities"),
        CheckConstraint("country_code ~ '^[A-Z]{2}$'", name="country_code_format"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    region: Mapped[str | None] = mapped_column(String(200))
    country_code: Mapped[str] = mapped_column(String(2))
    center: Mapped[Any | None] = point_column(nullable=True)

    center_latitude: Mapped[float | None] = column_property(func.ST_Y(cast(center, PLAIN_GEOMETRY)))
    center_longitude: Mapped[float | None] = column_property(
        func.ST_X(cast(center, PLAIN_GEOMETRY))
    )


class Architect(Base):
    __tablename__ = "architects"
    __table_args__ = (
        slug_check("architects"),
        CheckConstraint(
            "death_year IS NULL OR birth_year IS NULL OR death_year >= birth_year",
            name="lifespan_order",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    birth_year: Mapped[int | None] = mapped_column(SmallInteger)
    death_year: Mapped[int | None] = mapped_column(SmallInteger)
    bio: Mapped[str | None] = mapped_column(Text)


class Style(Base):
    __tablename__ = "styles"
    __table_args__ = (
        slug_check("styles"),
        CheckConstraint("parent_style_id IS NULL OR parent_style_id <> id", name="not_own_parent"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    parent_style_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("styles.id", ondelete="SET NULL"), index=True
    )

    parent: Mapped["Style | None"] = relationship(remote_side=[id])


class Period(Base):
    __tablename__ = "periods"
    __table_args__ = (
        slug_check("periods"),
        CheckConstraint(
            "end_year IS NULL OR start_year IS NULL OR end_year >= start_year",
            name="year_order",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    start_year: Mapped[int | None] = mapped_column(SmallInteger)
    end_year: Mapped[int | None] = mapped_column(SmallInteger)


class BuildingType(Base):
    __tablename__ = "building_types"
    __table_args__ = (slug_check("building_types"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(200))


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        slug_check("tags"),
        CheckConstraint(f"category IN {sql_in(TagCategory)}", name="category_valid"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(40), index=True)


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (
        CheckConstraint(f"source_type IN {sql_in(SourceType)}", name="source_type_valid"),
        CheckConstraint("url ~ '^https?://'", name="url_format"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(2000), unique=True)
    publisher: Mapped[str] = mapped_column(String(300))
    source_type: Mapped[str] = mapped_column(String(40))
    accessed_at: Mapped[date]


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (
        slug_check("places"),
        CheckConstraint(f"status IN {sql_in(PlaceStatus)}", name="status_valid"),
        CheckConstraint(f"public_access IN {sql_in(PublicAccess)}", name="public_access_valid"),
        CheckConstraint(f"admission_type IN {sql_in(AdmissionType)}", name="admission_type_valid"),
        CheckConstraint("country_code ~ '^[A-Z]{2}$'", name="country_code_format"),
        CheckConstraint(
            "significance_score IS NULL OR significance_score BETWEEN 1 AND 5",
            name="significance_score_range",
        ),
        CheckConstraint(
            "status <> 'published' OR significance_score IS NOT NULL",
            name="published_has_significance_score",
        ),
        CheckConstraint(
            "status <> 'published' OR visit_minutes_exterior IS NOT NULL",
            name="published_has_exterior_minutes",
        ),
        CheckConstraint(
            "year_built_end IS NULL OR year_built_start IS NULL "
            "OR year_built_end >= year_built_start",
            name="year_built_order",
        ),
        CheckConstraint(
            "year_built_end IS NULL OR year_built_start IS NOT NULL",
            name="year_built_end_requires_start",
        ),
        CheckConstraint(
            "visit_minutes_exterior IS NULL OR visit_minutes_exterior > 0",
            name="visit_minutes_exterior_positive",
        ),
        CheckConstraint(
            "visit_minutes_interior IS NULL OR visit_minutes_interior > 0",
            name="visit_minutes_interior_positive",
        ),
        CheckConstraint(
            "website_url IS NULL OR website_url ~ '^https?://'", name="website_url_format"
        ),
        # Geography index: distance and corridor queries such as ST_DWithin.
        Index("ix_places_location_gist", "location", postgresql_using="gist"),
        # Geometry index: rectangular map viewport queries.
        Index(
            "ix_places_location_geometry_gist",
            text("(location::geometry)"),
            postgresql_using="gist",
        ),
        Index("ix_places_year_built_start", "year_built_start"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), server_default=PlaceStatus.DRAFT, index=True)

    location: Mapped[Any] = point_column(nullable=False)
    address_line: Mapped[str | None] = mapped_column(String(300))
    city_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cities.id", ondelete="RESTRICT"), index=True
    )
    country_code: Mapped[str] = mapped_column(String(2))
    timezone: Mapped[str] = mapped_column(String(64))

    year_built_start: Mapped[int | None] = mapped_column(SmallInteger)
    year_built_end: Mapped[int | None] = mapped_column(SmallInteger)
    year_is_approximate: Mapped[bool] = mapped_column(server_default=text("false"))

    building_type_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("building_types.id", ondelete="RESTRICT"), index=True
    )
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("periods.id", ondelete="RESTRICT"), index=True
    )

    description: Mapped[str | None] = mapped_column(Text)
    significance_text: Mapped[str | None] = mapped_column(Text)
    # Curated product score, not a historical fact. Never has provenance.
    significance_score: Mapped[int | None] = mapped_column(SmallInteger)

    public_access: Mapped[str] = mapped_column(String(20), server_default=PublicAccess.UNKNOWN)
    admission_type: Mapped[str] = mapped_column(String(20), server_default=AdmissionType.UNKNOWN)
    admission_notes: Mapped[str | None] = mapped_column(Text)
    reservation_required: Mapped[bool | None]
    tours_available: Mapped[bool | None]

    # Curated product estimates, not sourced facts. Never have provenance.
    visit_minutes_exterior: Mapped[int | None] = mapped_column(SmallInteger)
    visit_minutes_interior: Mapped[int | None] = mapped_column(SmallInteger)

    accessibility: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    website_url: Mapped[str | None] = mapped_column(String(2000))
    google_place_id: Mapped[str | None] = mapped_column(String(300), unique=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    latitude: Mapped[float] = column_property(func.ST_Y(cast(location, PLAIN_GEOMETRY)))
    longitude: Mapped[float] = column_property(func.ST_X(cast(location, PLAIN_GEOMETRY)))

    city: Mapped[City] = relationship()
    building_type: Mapped[BuildingType | None] = relationship()
    period: Mapped[Period | None] = relationship()
    architect_links: Mapped[list["PlaceArchitect"]] = relationship(
        back_populates="place", cascade="all, delete-orphan", passive_deletes=True
    )
    style_links: Mapped[list["PlaceStyle"]] = relationship(
        back_populates="place", cascade="all, delete-orphan", passive_deletes=True
    )
    tag_links: Mapped[list["PlaceTag"]] = relationship(
        back_populates="place", cascade="all, delete-orphan", passive_deletes=True
    )
    images: Mapped[list["PlaceImage"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="PlaceImage.sort_order"
    )
    opening_hours: Mapped[list["OpeningHours"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(OpeningHours.day_of_week, OpeningHours.opens)",
    )
    opening_hours_exceptions: Mapped[list["OpeningHoursException"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    field_sources: Mapped[list["PlaceFieldSource"]] = relationship(
        back_populates="place", cascade="all, delete-orphan", passive_deletes=True
    )


class PlaceArchitect(Base):
    __tablename__ = "place_architects"

    place_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    architect_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("architects.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    # Free text such as "architect", "original architect", "addition".
    role: Mapped[str] = mapped_column(String(100), primary_key=True, server_default="architect")

    place: Mapped[Place] = relationship(back_populates="architect_links")
    architect: Mapped[Architect] = relationship()


class PlaceStyle(Base):
    __tablename__ = "place_styles"
    __table_args__ = (
        # At most one primary style per place.
        Index(
            "uq_place_styles_one_primary",
            "place_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    place_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    style_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("styles.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    is_primary: Mapped[bool] = mapped_column(server_default=text("false"))

    place: Mapped[Place] = relationship(back_populates="style_links")
    style: Mapped[Style] = relationship()


class PlaceTag(Base):
    __tablename__ = "place_tags"

    place_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True, index=True
    )

    place: Mapped[Place] = relationship(back_populates="tag_links")
    tag: Mapped[Tag] = relationship()


class PlaceImage(Base):
    __tablename__ = "place_images"
    __table_args__ = (
        UniqueConstraint("place_id", "storage_path"),
        CheckConstraint("source_url ~ '^https?://'", name="source_url_format"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    place_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    storage_path: Mapped[str] = mapped_column(String(1000))
    # Licensing metadata is mandatory for every image.
    credit: Mapped[str] = mapped_column(String(500))
    license: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str] = mapped_column(String(2000))
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))


class OpeningHours(Base):
    __tablename__ = "opening_hours"
    __table_args__ = (
        # 0 is Monday, 6 is Sunday. Times are local to the place's timezone.
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="day_of_week_range"),
        CheckConstraint(
            "valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from",
            name="validity_order",
        ),
        UniqueConstraint(
            "place_id", "day_of_week", "opens", "valid_from", postgresql_nulls_not_distinct=True
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    place_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger)
    opens: Mapped[time]
    closes: Mapped[time]
    valid_from: Mapped[date | None]
    valid_to: Mapped[date | None]


class OpeningHoursException(Base):
    __tablename__ = "opening_hours_exceptions"
    __table_args__ = (
        UniqueConstraint("place_id", "date"),
        CheckConstraint(
            "is_closed OR (opens IS NOT NULL AND closes IS NOT NULL)",
            name="open_exception_has_times",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    place_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date]
    is_closed: Mapped[bool] = mapped_column(server_default=text("true"))
    opens: Mapped[time | None]
    closes: Mapped[time | None]
    note: Mapped[str | None] = mapped_column(Text)


class PlaceFieldSource(Base):
    """Provenance: which source supports which factual field of a place."""

    __tablename__ = "place_field_sources"
    __table_args__ = (
        CheckConstraint(f"field_name IN {sql_in(SOURCEABLE_FIELDS)}", name="field_name_sourceable"),
        CheckConstraint(
            f"field_name NOT IN {sql_in(CURATED_FIELDS)}", name="field_name_not_curated"
        ),
    )

    place_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    field_name: Mapped[str] = mapped_column(String(60), primary_key=True)
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sources.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    # What the source says, ideally a short quotation.
    note: Mapped[str | None] = mapped_column(Text)

    place: Mapped[Place] = relationship(back_populates="field_sources")
    source: Mapped[Source] = relationship()
