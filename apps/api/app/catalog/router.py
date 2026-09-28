"""HTTP endpoints for the catalog."""

from typing import Annotated, Self

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.catalog import schemas, search, service
from app.catalog.enums import AdmissionType, PublicAccess
from app.core.db import get_session
from app.geo.types import BoundingBox

router = APIRouter(tags=["catalog"])

SessionDep = Annotated[Session, Depends(get_session)]
SlugList = Annotated[list[str], Field(default_factory=list, max_length=20)]
Year = Annotated[int | None, Field(ge=-3000, le=3000)]


class PlaceQuery(BaseModel):
    """Query parameters for the place list. Unknown parameters are rejected."""

    model_config = ConfigDict(extra="forbid")

    bbox: str | None = Field(
        default=None,
        description="Viewport as west,south,east,north in decimal degrees.",
        examples=["-71.12,42.34,-71.05,42.37"],
    )
    q: str | None = Field(
        default=None,
        max_length=search.MAX_QUERY_LENGTH * 2,
        description=(
            "Text search. Every word must match the name, an architect, a style, "
            "a tag, or the building type. Case-insensitive. Blank means no search."
        ),
        examples=["richardson"],
    )
    architect: SlugList = Field(description="Architect slug. Repeat to match any of them.")
    style: SlugList = Field(
        description="Style slug. Sub-styles are included. Repeat to match any of them."
    )
    building_type: SlugList = Field(description="Building type slug. Repeat to match any.")
    period: SlugList = Field(description="Period slug. Repeat to match any of them.")
    tag: SlugList = Field(description="Tag slug. Repeat to require every tag.")
    public_access: list[PublicAccess] = Field(default_factory=list)
    admission_type: list[AdmissionType] = Field(default_factory=list)
    tours_available: bool | None = None
    year_from: Year = Field(default=None, description="Built in or after this year.")
    year_to: Year = Field(default=None, description="Built in or before this year.")
    limit: int = Field(default=service.DEFAULT_LIMIT, ge=1, le=service.MAX_LIMIT)
    offset: int = Field(default=0, ge=0)

    @field_validator("bbox")
    @classmethod
    def bbox_is_valid(cls, value: str | None) -> str | None:
        if value is not None:
            BoundingBox.parse(value)
        return value

    @field_validator("q")
    @classmethod
    def normalize_search(cls, value: str | None) -> str | None:
        normalized = search.normalize_query(value)
        if normalized is not None:
            search.split_terms(normalized)
        return normalized

    @model_validator(mode="after")
    def year_range_is_ordered(self) -> Self:
        if self.year_from is not None and self.year_to is not None:
            if self.year_from > self.year_to:
                raise ValueError("year_from must not be greater than year_to")
        return self

    def to_filters(self) -> service.PlaceFilters:
        return service.PlaceFilters(
            bbox=BoundingBox.parse(self.bbox) if self.bbox else None,
            search=self.q,
            architects=self.architect,
            styles=self.style,
            building_types=self.building_type,
            periods=self.period,
            tags=self.tag,
            public_access=self.public_access,
            admission_types=self.admission_type,
            tours_available=self.tours_available,
            year_from=self.year_from,
            year_to=self.year_to,
        )


@router.get("/places")
def list_places(
    session: SessionDep, query: Annotated[PlaceQuery, Query()]
) -> schemas.PlaceListResponse:
    """Published places as lightweight items for markers and lists."""
    return service.list_places(session, query.to_filters(), limit=query.limit, offset=query.offset)


@router.get("/places/{slug}")
def get_place(slug: str, session: SessionDep) -> schemas.PlaceDetail:
    """Full details of one published place, including provenance."""
    place = service.get_place(session, slug)
    if place is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Place not found")
    return place


@router.get("/filters")
def get_filters(session: SessionDep) -> schemas.FiltersResponse:
    """Available filter options with counts of published places."""
    return service.get_filters(session)
