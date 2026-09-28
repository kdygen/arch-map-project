"""Catalog queries: place search, place detail, and filter options."""

from dataclasses import dataclass, field

from sqlalchemy import Select, and_, func, select
from sqlalchemy.orm import Session, selectinload

from app.catalog import schemas
from app.catalog.enums import AdmissionType, PlaceStatus, PublicAccess
from app.catalog.models import (
    Architect,
    BuildingType,
    Period,
    Place,
    PlaceArchitect,
    PlaceFieldSource,
    PlaceStyle,
    PlaceTag,
    Style,
    Tag,
)
from app.catalog.search import search_condition, style_ids_with_descendants
from app.geo import corridor
from app.geo import service as geo
from app.geo.types import BoundingBox

DEFAULT_LIMIT = 100
MAX_LIMIT = 500


@dataclass(frozen=True)
class PlaceFilters:
    """Structured search parameters.

    Values inside one filter are alternatives, so two architects means
    "by either". Tags are the exception: a place must have every tag.
    Different filters always combine with AND, and so does the text search.
    """

    bbox: BoundingBox | None = None
    # Already normalized. None means no text search.
    search: str | None = None
    architects: list[str] = field(default_factory=list)
    styles: list[str] = field(default_factory=list)
    building_types: list[str] = field(default_factory=list)
    periods: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    public_access: list[PublicAccess] = field(default_factory=list)
    admission_types: list[AdmissionType] = field(default_factory=list)
    tours_available: bool | None = None
    year_from: int | None = None
    year_to: int | None = None
    # Not exposed over HTTP. Drafts stay hidden until there is authentication.
    include_unpublished: bool = False


def _apply_filters(query: Select, filters: PlaceFilters) -> Select:
    if not filters.include_unpublished:
        query = query.where(Place.status == PlaceStatus.PUBLISHED)

    if filters.bbox is not None:
        query = query.where(geo.within_bounding_box(Place.location, filters.bbox))

    if filters.search is not None:
        query = query.where(search_condition(filters.search))

    if filters.architects:
        query = query.where(
            Place.id.in_(
                select(PlaceArchitect.place_id)
                .join(Architect)
                .where(Architect.slug.in_(filters.architects))
            )
        )

    if filters.styles:
        query = query.where(
            Place.id.in_(
                select(PlaceStyle.place_id).where(
                    PlaceStyle.style_id.in_(
                        style_ids_with_descendants(
                            select(Style.id).where(Style.slug.in_(filters.styles)),
                            name="filter_style_tree",
                        )
                    )
                )
            )
        )

    if filters.building_types:
        query = query.where(
            Place.building_type_id.in_(
                select(BuildingType.id).where(BuildingType.slug.in_(filters.building_types))
            )
        )

    if filters.periods:
        query = query.where(
            Place.period_id.in_(select(Period.id).where(Period.slug.in_(filters.periods)))
        )

    for tag_slug in dict.fromkeys(filters.tags):
        query = query.where(
            Place.id.in_(select(PlaceTag.place_id).join(Tag).where(Tag.slug == tag_slug))
        )

    if filters.public_access:
        query = query.where(Place.public_access.in_(filters.public_access))

    if filters.admission_types:
        query = query.where(Place.admission_type.in_(filters.admission_types))

    if filters.tours_available is not None:
        query = query.where(Place.tours_available.is_(filters.tours_available))

    # A construction span matches when it overlaps the requested year range.
    if filters.year_from is not None:
        query = query.where(
            func.coalesce(Place.year_built_end, Place.year_built_start) >= filters.year_from
        )
    if filters.year_to is not None:
        query = query.where(Place.year_built_start <= filters.year_to)

    return query


def _architect_refs(place: Place) -> list[schemas.ArchitectRef]:
    links = sorted(place.architect_links, key=lambda link: (link.architect.name, link.role))
    return [
        schemas.ArchitectRef(slug=link.architect.slug, name=link.architect.name, role=link.role)
        for link in links
    ]


def _style_refs(place: Place) -> list[schemas.StyleRef]:
    links = sorted(place.style_links, key=lambda link: (not link.is_primary, link.style.name))
    return [
        schemas.StyleRef(slug=link.style.slug, name=link.style.name, is_primary=link.is_primary)
        for link in links
    ]


def _to_summary(place: Place) -> schemas.PlaceSummary:
    styles = _style_refs(place)
    primary = next((s for s in styles if s.is_primary), None)
    return schemas.PlaceSummary(
        id=place.id,
        slug=place.slug,
        name=place.name,
        latitude=place.latitude,
        longitude=place.longitude,
        year_built_start=place.year_built_start,
        year_built_end=place.year_built_end,
        year_is_approximate=place.year_is_approximate,
        building_type=place.building_type,
        primary_style=schemas.NamedRef(slug=primary.slug, name=primary.name) if primary else None,
        architects=_architect_refs(place),
        public_access=place.public_access,
        admission_type=place.admission_type,
        tours_available=place.tours_available,
        significance_score=place.significance_score,
        visit_minutes_exterior=place.visit_minutes_exterior,
        visit_minutes_interior=place.visit_minutes_interior,
    )


def list_places(
    session: Session,
    filters: PlaceFilters,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> schemas.PlaceListResponse:
    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")
    if offset < 0:
        raise ValueError("offset must not be negative")

    total = session.scalar(_apply_filters(select(func.count()).select_from(Place), filters))

    query = (
        _apply_filters(select(Place), filters)
        .options(
            selectinload(Place.building_type),
            selectinload(Place.architect_links).selectinload(PlaceArchitect.architect),
            selectinload(Place.style_links).selectinload(PlaceStyle.style),
        )
        # Deterministic order: most significant first, then name, then id.
        .order_by(Place.significance_score.desc().nulls_last(), Place.name, Place.id)
        .limit(limit)
        .offset(offset)
    )
    places = session.scalars(query).all()

    return schemas.PlaceListResponse(
        items=[_to_summary(place) for place in places],
        total=total or 0,
        limit=limit,
        offset=offset,
    )


def get_place(
    session: Session, slug: str, include_unpublished: bool = False
) -> schemas.PlaceDetail | None:
    query = (
        select(Place)
        .where(Place.slug == slug)
        .options(
            selectinload(Place.city),
            selectinload(Place.building_type),
            selectinload(Place.period),
            selectinload(Place.architect_links).selectinload(PlaceArchitect.architect),
            selectinload(Place.style_links).selectinload(PlaceStyle.style),
            selectinload(Place.tag_links).selectinload(PlaceTag.tag),
            selectinload(Place.images),
            selectinload(Place.opening_hours),
            selectinload(Place.field_sources).selectinload(PlaceFieldSource.source),
        )
    )
    if not include_unpublished:
        query = query.where(Place.status == PlaceStatus.PUBLISHED)

    place = session.scalars(query).one_or_none()
    if place is None:
        return None

    tags = sorted((link.tag for link in place.tag_links), key=lambda t: (t.category, t.name))
    field_sources = sorted(place.field_sources, key=lambda fs: (fs.field_name, fs.source.url))

    return schemas.PlaceDetail(
        id=place.id,
        slug=place.slug,
        name=place.name,
        latitude=place.latitude,
        longitude=place.longitude,
        address_line=place.address_line,
        city=place.city,
        country_code=place.country_code,
        timezone=place.timezone,
        year_built_start=place.year_built_start,
        year_built_end=place.year_built_end,
        year_is_approximate=place.year_is_approximate,
        building_type=place.building_type,
        period=place.period,
        architects=_architect_refs(place),
        styles=_style_refs(place),
        tags=tags,
        description=place.description,
        significance_text=place.significance_text,
        public_access=place.public_access,
        admission_type=place.admission_type,
        admission_notes=place.admission_notes,
        reservation_required=place.reservation_required,
        tours_available=place.tours_available,
        accessibility=place.accessibility,
        website_url=place.website_url,
        images=place.images,
        opening_hours=place.opening_hours,
        curated=schemas.CuratedOut.model_validate(place),
        field_sources=field_sources,
    )


def get_filters(session: Session) -> schemas.FiltersResponse:
    """Filter options with the number of published places for each.

    Options with no published places are left out.
    """
    published = Place.status == PlaceStatus.PUBLISHED

    def count_via_link(entity, link, link_fk):
        return session.execute(
            select(entity, func.count(func.distinct(Place.id)))
            .join(link, link_fk == entity.id)
            .join(Place, and_(Place.id == link.place_id, published))
            .group_by(entity.id)
            .order_by(entity.name)
        ).all()

    def count_direct(entity, place_fk):
        return session.execute(
            select(entity, func.count(Place.id))
            .join(Place, and_(place_fk == entity.id, published))
            .group_by(entity.id)
            .order_by(entity.name)
        ).all()

    def count_values(column):
        rows = session.execute(
            select(column, func.count()).where(published).group_by(column).order_by(column)
        ).all()
        return [schemas.ValueOption(value=value, count=count) for value, count in rows]

    def options(rows):
        return [schemas.FilterOption(slug=e.slug, name=e.name, count=c) for e, c in rows]

    categories: dict[str, list[schemas.FilterOption]] = {}
    for tag, count in count_via_link(Tag, PlaceTag, PlaceTag.tag_id):
        categories.setdefault(tag.category, []).append(
            schemas.FilterOption(slug=tag.slug, name=tag.name, count=count)
        )

    period_rows = session.execute(
        select(Period, func.count(Place.id))
        .join(Place, and_(Place.period_id == Period.id, published))
        .group_by(Period.id)
        .order_by(Period.start_year.nulls_first(), Period.name)
    ).all()

    year_min, year_max = session.execute(
        select(
            func.min(Place.year_built_start),
            func.max(func.coalesce(Place.year_built_end, Place.year_built_start)),
        ).where(published)
    ).one()

    return schemas.FiltersResponse(
        architects=options(count_via_link(Architect, PlaceArchitect, PlaceArchitect.architect_id)),
        styles=options(count_via_link(Style, PlaceStyle, PlaceStyle.style_id)),
        periods=[
            schemas.PeriodOption(
                slug=p.slug, name=p.name, count=c, start_year=p.start_year, end_year=p.end_year
            )
            for p, c in period_rows
        ],
        building_types=options(count_direct(BuildingType, Place.building_type_id)),
        tag_categories=[
            schemas.TagCategoryOptions(category=category, tags=tags)
            for category, tags in sorted(categories.items())
        ],
        public_access=count_values(Place.public_access),
        admission_types=count_values(Place.admission_type),
        year_built=schemas.YearRange(min=year_min, max=year_max),
    )


def list_places_near_route(
    session: Session,
    filters: PlaceFilters,
    route_wkt: str,
    corridor_meters: float,
    limit: int = DEFAULT_LIMIT,
) -> schemas.RoutePlacesResponse:
    """Published places within `corridor_meters` of the route that match the filters.

    Ordered by progress along the route, then by distance from it, then by
    name and id, so equal inputs always give the same order.
    """
    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")
    if filters.bbox is not None:
        raise ValueError("a route search does not take a bounding box")

    line = corridor.line_geometry(route_wkt)
    near = corridor.within_corridor(Place.location, line, corridor_meters)

    total = session.scalar(
        _apply_filters(select(func.count()).select_from(Place), filters).where(near)
    )

    progress = corridor.progress_along_line(Place.location, line).label("progress")
    distance = corridor.distance_to_line_meters(Place.location, line).label("distance")
    rows = session.execute(
        _apply_filters(select(Place, progress, distance), filters)
        .where(near)
        .options(
            selectinload(Place.building_type),
            selectinload(Place.architect_links).selectinload(PlaceArchitect.architect),
            selectinload(Place.style_links).selectinload(PlaceStyle.style),
        )
        .order_by(progress, distance, Place.name, Place.id)
        .limit(limit)
    ).all()

    return schemas.RoutePlacesResponse(
        items=[
            schemas.RoutePlace(
                place=_to_summary(place),
                distance_from_route_meters=round(dist),
                route_progress=round(min(max(prog, 0.0), 1.0), 4),
            )
            for place, prog, dist in rows
        ],
        total=total or 0,
        corridor_meters=corridor_meters,
    )
