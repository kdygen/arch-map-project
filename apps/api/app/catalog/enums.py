"""Allowed values for constrained text columns.

These are stored as text with CHECK constraints instead of native PostgreSQL
enums, because adding or renaming a value is then an ordinary migration.
"""

from enum import StrEnum


class PlaceStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class PublicAccess(StrEnum):
    PUBLIC = "public"
    EXTERIOR_ONLY = "exterior_only"
    BY_APPOINTMENT = "by_appointment"
    PRIVATE = "private"
    UNKNOWN = "unknown"


class AdmissionType(StrEnum):
    FREE = "free"
    PAID = "paid"
    DONATION = "donation"
    UNKNOWN = "unknown"


class SourceType(StrEnum):
    OFFICIAL_SITE = "official_site"
    GOVERNMENT = "government"
    PRESERVATION_ORG = "preservation_org"
    ACADEMIC = "academic"
    OTHER = "other"


class TagCategory(StrEnum):
    FEATURE = "feature"
    INTERIOR = "interior"
    MATERIAL = "material"
    DESIGNATION = "designation"


# Fields that hold externally sourced facts and may carry provenance.
# Relationship names such as "architects" cover the whole relationship.
SOURCEABLE_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "address",
        "location",
        "architects",
        "styles",
        "year_built",
        "building_type",
        "description",
        "significance_text",
        "public_access",
        "admission",
        "reservation_required",
        "tours_available",
        "accessibility",
        "website_url",
        "opening_hours",
        "tags",
    }
)

# Fields that are our own product judgments. They never carry provenance.
CURATED_FIELDS: frozenset[str] = frozenset(
    {"significance_score", "visit_minutes_exterior", "visit_minutes_interior"}
)


def sql_in(values: type[StrEnum] | frozenset[str]) -> str:
    """Render values as a SQL list for a CHECK constraint."""
    items = sorted(str(v) for v in values)
    return "(" + ", ".join(f"'{item}'" for item in items) + ")"
