"""Write validated seed data to the database.

Every record is matched on a natural key, so importing twice changes nothing.
The importer never commits. The caller owns the transaction, which means a
failure part-way leaves the database untouched.

Records that are missing from the seed files are never deleted. Removing a
place or a taxonomy entry is a deliberate manual action.
"""

from collections import Counter
from collections.abc import Callable, Hashable, Iterable
from dataclasses import dataclass, field
from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog.models import (
    Architect,
    BuildingType,
    City,
    OpeningHours,
    Period,
    Place,
    PlaceArchitect,
    PlaceFieldSource,
    PlaceImage,
    PlaceStyle,
    PlaceTag,
    Source,
    Style,
    Tag,
)
from app.geo.service import point_wkt
from app.geo.types import Point
from app.seeding.loader import SeedData
from app.seeding.schema import Coordinates, PlaceSeed

T = TypeVar("T")


@dataclass
class ImportReport:
    created: Counter[str] = field(default_factory=Counter)
    updated: Counter[str] = field(default_factory=Counter)
    unchanged: Counter[str] = field(default_factory=Counter)

    @property
    def has_changes(self) -> bool:
        return bool(self.created or self.updated)

    def lines(self) -> list[str]:
        kinds = sorted(set(self.created) | set(self.updated) | set(self.unchanged))
        return [
            f"{kind:<16} created {self.created[kind]:>3}   "
            f"updated {self.updated[kind]:>3}   unchanged {self.unchanged[kind]:>3}"
            for kind in kinds
        ]


class Importer:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.report = ImportReport()

    def _set(self, obj: Any, values: dict[str, Any]) -> bool:
        """Assign only values that differ. Returns True when something changed."""
        changed = False
        for name, value in values.items():
            if getattr(obj, name) != value:
                setattr(obj, name, value)
                changed = True
        return changed

    def _set_point(self, obj: Any, prefix: str, column: str, coords: Coordinates | None) -> bool:
        """Assign a geography point only when the coordinates differ."""
        current = (getattr(obj, f"{prefix}latitude"), getattr(obj, f"{prefix}longitude"))
        wanted = (coords.latitude, coords.longitude) if coords else (None, None)
        if current == wanted:
            return False
        setattr(obj, column, point_wkt(Point(*wanted)) if coords else None)
        return True

    def _record(self, kind: str, is_new: bool, changed: bool) -> None:
        if is_new:
            self.report.created[kind] += 1
        elif changed:
            self.report.updated[kind] += 1
        else:
            self.report.unchanged[kind] += 1

    def _upsert(self, model: type[T], kind: str, key: dict[str, Any], values: dict) -> T:
        obj = self.session.scalars(select(model).filter_by(**key)).one_or_none()
        is_new = obj is None
        if is_new:
            obj = model(**key, **values)
            self.session.add(obj)
            changed = True
        else:
            changed = self._set(obj, values)
        self._record(kind, is_new, changed)
        return obj

    def _sync(
        self,
        existing: list[T],
        wanted: dict[Hashable, dict[str, Any]],
        key_of: Callable[[T], Hashable],
        create: Callable[[Hashable, dict[str, Any]], T],
    ) -> bool:
        """Make a child collection match `wanted`. Returns True on any change."""
        changed = False
        current = {key_of(item): item for item in existing}
        for key, item in current.items():
            if key not in wanted:
                existing.remove(item)
                changed = True
        for key, values in wanted.items():
            if key in current:
                changed |= self._set(current[key], values)
            else:
                existing.append(create(key, values))
                changed = True
        return changed

    def _by_slug(self, model: type[T], slugs: Iterable[str]) -> dict[str, T]:
        rows = self.session.scalars(select(model).where(model.slug.in_(set(slugs))))
        return {row.slug: row for row in rows}

    def import_taxonomy(self, data: SeedData) -> None:
        taxonomy = data.taxonomy

        for city in taxonomy.cities:
            values = {
                "name": city.name,
                "region": city.region,
                "country_code": city.country_code,
            }
            obj = self.session.scalars(select(City).filter_by(slug=city.slug)).one_or_none()
            if obj is None:
                center = point_wkt(Point(**city.center.model_dump())) if city.center else None
                self.session.add(City(slug=city.slug, center=center, **values))
                self._record("cities", is_new=True, changed=True)
            else:
                changed = self._set(obj, values)
                changed |= self._set_point(obj, "center_", "center", city.center)
                self._record("cities", is_new=False, changed=changed)

        for period in taxonomy.periods:
            self._upsert(
                Period, "periods", {"slug": period.slug}, period.model_dump(exclude={"slug"})
            )
        for building_type in taxonomy.building_types:
            self._upsert(
                BuildingType,
                "building_types",
                {"slug": building_type.slug},
                {"name": building_type.name},
            )
        for tag in taxonomy.tags:
            self._upsert(
                Tag, "tags", {"slug": tag.slug}, {"name": tag.name, "category": tag.category.value}
            )
        for architect in taxonomy.architects:
            self._upsert(
                Architect,
                "architects",
                {"slug": architect.slug},
                architect.model_dump(exclude={"slug"}),
            )

        # Styles need two passes, because a parent may be listed after its child.
        styles = {
            style.slug: self.session.scalars(select(Style).filter_by(slug=style.slug)).one_or_none()
            for style in taxonomy.styles
        }
        new_slugs = {slug for slug, obj in styles.items() if obj is None}
        changed_slugs: set[str] = set()
        for style in taxonomy.styles:
            if styles[style.slug] is None:
                styles[style.slug] = Style(slug=style.slug, name=style.name)
                self.session.add(styles[style.slug])
            elif self._set(styles[style.slug], {"name": style.name}):
                changed_slugs.add(style.slug)
        self.session.flush()
        for style in taxonomy.styles:
            parent_id = styles[style.parent].id if style.parent else None
            if self._set(styles[style.slug], {"parent_style_id": parent_id}):
                changed_slugs.add(style.slug)
        for slug in styles:
            self._record("styles", slug in new_slugs, slug in changed_slugs)

        self.session.flush()

    def import_place(self, seed: PlaceSeed) -> Place:
        session = self.session
        city = self._by_slug(City, [seed.city])[seed.city]
        building_type = (
            self._by_slug(BuildingType, [seed.building_type])[seed.building_type]
            if seed.building_type
            else None
        )
        period = self._by_slug(Period, [seed.period])[seed.period] if seed.period else None

        values = {
            "name": seed.name,
            "status": seed.status.value,
            "address_line": seed.address_line,
            "city_id": city.id,
            "country_code": seed.country_code,
            "timezone": seed.timezone,
            "year_built_start": seed.year_built.start if seed.year_built else None,
            "year_built_end": seed.year_built.end if seed.year_built else None,
            "year_is_approximate": seed.year_built.is_approximate if seed.year_built else False,
            "building_type_id": building_type.id if building_type else None,
            "period_id": period.id if period else None,
            "description": seed.description,
            "significance_text": seed.significance_text,
            "significance_score": seed.curated.significance_score,
            "public_access": seed.public_access.value,
            "admission_type": seed.admission.type.value,
            "admission_notes": seed.admission.notes,
            "reservation_required": seed.reservation_required,
            "tours_available": seed.tours_available,
            "visit_minutes_exterior": seed.curated.visit_minutes_exterior,
            "visit_minutes_interior": seed.curated.visit_minutes_interior,
            "accessibility": seed.accessibility,
            "website_url": str(seed.website_url) if seed.website_url else None,
            "google_place_id": seed.google_place_id,
        }

        place = session.scalars(select(Place).filter_by(slug=seed.slug)).one_or_none()
        is_new = place is None
        if is_new:
            location = point_wkt(Point(**seed.location.model_dump()))
            place = Place(slug=seed.slug, location=location, **values)
            session.add(place)
            session.flush()
            changed = True
        else:
            changed = self._set(place, values)
            changed |= self._set_point(place, "", "location", seed.location)

        architects = self._by_slug(Architect, [a.architect for a in seed.architects])
        changed |= self._sync(
            place.architect_links,
            {(architects[a.architect].id, a.role): {} for a in seed.architects},
            key_of=lambda link: (link.architect_id, link.role),
            create=lambda key, _: PlaceArchitect(architect_id=key[0], role=key[1]),
        )

        styles = self._by_slug(Style, [s.style for s in seed.styles])
        # Clear the old primary first, so the one-primary index is never violated.
        wanted_primary = {styles[s.style].id for s in seed.styles if s.is_primary}
        for link in place.style_links:
            if link.is_primary and link.style_id not in wanted_primary:
                link.is_primary = False
                changed = True
        session.flush()
        changed |= self._sync(
            place.style_links,
            {styles[s.style].id: {"is_primary": s.is_primary} for s in seed.styles},
            key_of=lambda link: link.style_id,
            create=lambda key, values: PlaceStyle(style_id=key, **values),
        )

        tags = self._by_slug(Tag, seed.tags)
        changed |= self._sync(
            place.tag_links,
            {tags[slug].id: {} for slug in seed.tags},
            key_of=lambda link: link.tag_id,
            create=lambda key, _: PlaceTag(tag_id=key),
        )

        changed |= self._sync(
            place.images,
            {
                image.storage_path: {
                    "credit": image.credit,
                    "license": image.license,
                    "source_url": str(image.source_url),
                    "sort_order": image.sort_order,
                }
                for image in seed.images
            },
            key_of=lambda image: image.storage_path,
            create=lambda key, values: PlaceImage(storage_path=key, **values),
        )

        changed |= self._sync(
            place.opening_hours,
            {
                (h.day_of_week, h.opens, h.valid_from): {
                    "closes": h.closes,
                    "valid_to": h.valid_to,
                }
                for h in seed.opening_hours
            },
            key_of=lambda h: (h.day_of_week, h.opens, h.valid_from),
            create=lambda key, values: OpeningHours(
                day_of_week=key[0], opens=key[1], valid_from=key[2], **values
            ),
        )

        sources: dict[str, Source] = {}
        for source in seed.sources:
            sources[source.key] = self._upsert(
                Source,
                "sources",
                {"url": str(source.url)},
                {
                    "title": source.title,
                    "publisher": source.publisher,
                    "source_type": source.source_type.value,
                    "accessed_at": source.accessed_at,
                },
            )
        session.flush()

        changed |= self._sync(
            place.field_sources,
            {(p.field, sources[p.source].id): {"note": p.note} for p in seed.provenance},
            key_of=lambda fs: (fs.field_name, fs.source_id),
            create=lambda key, values: PlaceFieldSource(
                field_name=key[0], source_id=key[1], **values
            ),
        )

        self._record("places", is_new, changed)
        session.flush()
        return place


def import_seed(session: Session, data: SeedData) -> ImportReport:
    """Upsert all seed data inside the caller's transaction."""
    importer = Importer(session)
    importer.import_taxonomy(data)
    for place in data.places:
        importer.import_place(place)
    return importer.report
