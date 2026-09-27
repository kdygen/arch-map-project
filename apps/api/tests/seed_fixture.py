"""A small FICTIONAL dataset for tests.

Nothing here describes a real building. Real data lives in `data/seed/`.
"""

import copy
import json
from pathlib import Path
from typing import Any

TAXONOMY: dict[str, Any] = {
    "cities": [
        {
            "slug": "testville",
            "name": "Testville",
            "region": "Test Region",
            "country_code": "US",
            "center": {"latitude": 42.36, "longitude": -71.06},
        }
    ],
    "periods": [
        {"slug": "old", "name": "Old", "start_year": 1700, "end_year": 1899},
        {"slug": "new", "name": "New", "start_year": 1900, "end_year": 1999},
    ],
    "building_types": [
        {"slug": "house", "name": "House"},
        {"slug": "tower", "name": "Tower"},
    ],
    "styles": [
        # The child is listed before its parent on purpose.
        {"slug": "brutalism", "name": "Brutalism", "parent": "modernism"},
        {"slug": "modernism", "name": "Modernism"},
        {"slug": "classical", "name": "Classical"},
    ],
    "tags": [
        {"slug": "dome", "name": "Dome", "category": "feature"},
        {"slug": "brick", "name": "Brick", "category": "material"},
    ],
    "architects": [
        {"slug": "a-one", "name": "A. One"},
        {"slug": "b-two", "name": "B. Two"},
        {"slug": "c-three", "name": "C. Three"},
    ],
}

SOURCE = {
    "key": "main",
    "title": "Example reference",
    "url": "https://example.org/reference",
    "publisher": "Example Org",
    "source_type": "official_site",
    "accessed_at": "2026-01-15",
}


def make_place(slug: str, latitude: float, longitude: float, **overrides: Any) -> dict[str, Any]:
    place: dict[str, Any] = {
        "slug": slug,
        "name": slug.replace("-", " ").title(),
        "status": "published",
        "location": {"latitude": latitude, "longitude": longitude},
        "address_line": "1 Test Street",
        "city": "testville",
        "country_code": "US",
        "timezone": "America/New_York",
        "year_built": {"start": 1950},
        "building_type": "house",
        "period": "new",
        "architects": [{"architect": "a-one"}],
        "styles": [{"style": "modernism", "is_primary": True}],
        "tags": [],
        "public_access": "public",
        "admission": {"type": "free"},
        "tours_available": False,
        "curated": {
            "significance_score": 3,
            "visit_minutes_exterior": 10,
            "visit_minutes_interior": 45,
        },
        "sources": [copy.deepcopy(SOURCE)],
        "provenance": [
            {"field": "location", "source": "main"},
            {"field": "architects", "source": "main", "note": "Designed by A. One"},
            {"field": "styles", "source": "main"},
            {"field": "year_built", "source": "main", "note": "Built in 1950"},
            {"field": "public_access", "source": "main"},
            {"field": "admission", "source": "main"},
            {"field": "tours_available", "source": "main"},
        ],
    }
    place.update(overrides)
    return place


def default_places() -> list[dict[str, Any]]:
    return [
        make_place(
            "alpha-house",
            42.3600,
            -71.0600,
            year_built={"start": 1795, "end": 1800},
            period="old",
            styles=[{"style": "classical", "is_primary": True}],
            tags=["dome"],
            admission={"type": "paid", "notes": "Ticket required"},
            tours_available=True,
            curated={
                "significance_score": 5,
                "visit_minutes_exterior": 15,
                "visit_minutes_interior": 60,
            },
        ),
        make_place(
            "beta-hall",
            42.3610,
            -71.0610,
            architects=[{"architect": "b-two"}],
            tags=["brick"],
            public_access="exterior_only",
        ),
        make_place(
            "gamma-tower",
            42.3600,
            -71.0900,
            year_built={"start": 1968},
            building_type="tower",
            architects=[
                {"architect": "b-two"},
                {"architect": "c-three", "role": "associate architect"},
            ],
            styles=[
                {"style": "brutalism", "is_primary": True},
                {"style": "classical", "is_primary": False},
            ],
            tags=["brick", "dome"],
            curated={"significance_score": 4, "visit_minutes_exterior": 20},
        ),
        make_place(
            "delta-draft",
            42.3605,
            -71.0605,
            status="draft",
            year_built={"start": 1900},
        ),
    ]


def write_seed(
    directory: Path,
    places: list[dict[str, Any]] | None = None,
    taxonomy: dict[str, Any] | None = None,
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    places_dir = directory / "places"
    places_dir.mkdir(exist_ok=True)
    for old in places_dir.glob("*.json"):
        old.unlink()
    (directory / "taxonomy.json").write_text(json.dumps(taxonomy or TAXONOMY, indent=2))
    for place in default_places() if places is None else places:
        (places_dir / f"{place['slug']}.json").write_text(json.dumps(place, indent=2))
    return directory
