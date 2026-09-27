"""Read and validate seed files. Nothing here touches the database."""

import json
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import ValidationError

from app.seeding.schema import PlaceSeed, TaxonomySeed

TAXONOMY_FILE = "taxonomy.json"
PLACES_DIR = "places"


@dataclass(frozen=True)
class SeedIssue:
    file: str
    location: str
    message: str

    def __str__(self) -> str:
        where = f" [{self.location}]" if self.location else ""
        return f"{self.file}{where}: {self.message}"


@dataclass
class SeedData:
    taxonomy: TaxonomySeed = field(default_factory=TaxonomySeed)
    places: list[PlaceSeed] = field(default_factory=list)


class SeedValidationError(Exception):
    def __init__(self, issues: list[SeedIssue]) -> None:
        self.issues = issues
        super().__init__(f"{len(issues)} problem(s) found in seed data")


def _read(path: Path, model, name: str, issues: list[SeedIssue]):
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        issues.append(SeedIssue(name, f"line {exc.lineno}", f"invalid JSON: {exc.msg}"))
        return None
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        for error in exc.errors():
            location = ".".join(str(part) for part in error["loc"])
            message = error["msg"].removeprefix("Value error, ")
            # One model validator may report several problems at once.
            for part in message.split("; "):
                issues.append(SeedIssue(name, location, part))
        return None


def _check_unique_slugs(taxonomy: TaxonomySeed, issues: list[SeedIssue]) -> None:
    for group in ("cities", "periods", "building_types", "styles", "tags", "architects"):
        slugs = [item.slug for item in getattr(taxonomy, group)]
        for slug in sorted({s for s in slugs if slugs.count(s) > 1}):
            issues.append(SeedIssue(TAXONOMY_FILE, group, f"duplicate slug '{slug}'"))


def _check_style_tree(taxonomy: TaxonomySeed, issues: list[SeedIssue]) -> None:
    parents = {style.slug: style.parent for style in taxonomy.styles}
    for slug, parent in parents.items():
        if parent is not None and parent not in parents:
            issues.append(
                SeedIssue(TAXONOMY_FILE, f"styles.{slug}", f"unknown parent style '{parent}'")
            )
            continue
        seen = {slug}
        while parent is not None:
            if parent in seen:
                issues.append(
                    SeedIssue(TAXONOMY_FILE, f"styles.{slug}", "style parents form a cycle")
                )
                break
            seen.add(parent)
            parent = parents.get(parent)


def _check_place(place: PlaceSeed, name: str, taxonomy: TaxonomySeed) -> list[SeedIssue]:
    issues: list[SeedIssue] = []

    def known(group: str) -> set[str]:
        return {item.slug for item in getattr(taxonomy, group)}

    def require(slug: str | None, group: str, location: str) -> None:
        if slug is not None and slug not in known(group):
            issues.append(
                SeedIssue(name, location, f"'{slug}' is not defined in {TAXONOMY_FILE} {group}")
            )

    if name != f"{PLACES_DIR}/{place.slug}.json":
        issues.append(SeedIssue(name, "slug", f"file must be named {place.slug}.json"))

    require(place.city, "cities", "city")
    require(place.building_type, "building_types", "building_type")
    require(place.period, "periods", "period")
    for link in place.architects:
        require(link.architect, "architects", "architects")
    for link in place.styles:
        require(link.style, "styles", "styles")
    for tag in place.tags:
        require(tag, "tags", "tags")

    city = next((c for c in taxonomy.cities if c.slug == place.city), None)
    if city is not None and city.country_code != place.country_code:
        issues.append(
            SeedIssue(name, "country_code", f"does not match city country {city.country_code}")
        )

    period = next((p for p in taxonomy.periods if p.slug == place.period), None)
    if period is not None and place.year_built is not None:
        start = place.year_built.start
        end = place.year_built.end or start
        too_early = period.start_year is not None and end < period.start_year
        too_late = period.end_year is not None and start > period.end_year
        if too_early or too_late:
            issues.append(
                SeedIssue(name, "period", f"year_built does not overlap period '{period.slug}'")
            )

    return issues


def load_seed(seed_dir: Path) -> SeedData:
    """Load and validate every seed file.

    Raises SeedValidationError listing every problem found, not just the first.
    """
    issues: list[SeedIssue] = []
    data = SeedData()

    taxonomy_path = seed_dir / TAXONOMY_FILE
    if not taxonomy_path.is_file():
        raise SeedValidationError([SeedIssue(TAXONOMY_FILE, "", "file not found")])

    taxonomy = _read(taxonomy_path, TaxonomySeed, TAXONOMY_FILE, issues)
    if taxonomy is not None:
        data.taxonomy = taxonomy
        _check_unique_slugs(taxonomy, issues)
        _check_style_tree(taxonomy, issues)

    # Sources are shared across places and keyed by URL, so their details must agree.
    sources_by_url: dict[str, tuple[str, tuple]] = {}
    google_ids: dict[str, str] = {}

    for path in sorted((seed_dir / PLACES_DIR).glob("*.json")):
        name = f"{PLACES_DIR}/{path.name}"
        place = _read(path, PlaceSeed, name, issues)
        if place is None:
            continue
        if taxonomy is not None:
            issues.extend(_check_place(place, name, taxonomy))

        for source in place.sources:
            details = (source.title, source.publisher, source.source_type, source.accessed_at)
            first = sources_by_url.setdefault(str(source.url), (name, details))
            if first[1] != details:
                issues.append(
                    SeedIssue(
                        name,
                        f"sources.{source.key}",
                        f"same url as a source in {first[0]} but with different details",
                    )
                )

        if place.google_place_id is not None:
            first_file = google_ids.setdefault(place.google_place_id, name)
            if first_file != name:
                issues.append(SeedIssue(name, "google_place_id", f"already used by {first_file}"))

        data.places.append(place)

    if issues:
        raise SeedValidationError(issues)
    return data
