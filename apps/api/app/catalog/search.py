"""Text search over the catalog.

Current strategy: every word of the query must match, case-insensitively,
the start of a word in a place's searchable text. So "richard" finds
"Henry Hobson Richardson", but "mit" does not find "Dormitory". The searchable text is the place
name, its architects, its styles, its tags, and its building type. A style
match also finds places with a sub-style, so "Victorian" finds places whose
style is a kind of Victorian.

Everything here returns a SQL condition, so the strategy can later be
replaced with PostgreSQL full-text search or pg_trgm similarity without
changing callers.
"""

import re

from sqlalchemy import ColumnElement, Select, and_, exists, or_, select

from app.catalog.models import (
    Architect,
    BuildingType,
    Place,
    PlaceArchitect,
    PlaceStyle,
    PlaceTag,
    Style,
    Tag,
)

MAX_QUERY_LENGTH = 100
MAX_TERMS = 8
_ESCAPE = "\\"


class SearchQueryError(ValueError):
    pass


def normalize_query(raw: str | None) -> str | None:
    """Trim and collapse whitespace. An empty query means no search."""
    if raw is None:
        return None
    normalized = " ".join(raw.split())
    return normalized or None


def split_terms(query: str) -> list[str]:
    """Lowercased, de-duplicated words, in their original order."""
    terms = list(dict.fromkeys(term.lower() for term in query.split()))
    if len(query) > MAX_QUERY_LENGTH:
        raise SearchQueryError(f"search must be at most {MAX_QUERY_LENGTH} characters")
    if len(terms) > MAX_TERMS:
        raise SearchQueryError(f"search must have at most {MAX_TERMS} words")
    return terms


# Characters after which a new word starts.
WORD_SEPARATORS = (" ", "-", "(", "/")


def _word_start_patterns(term: str) -> list[str]:
    """LIKE patterns matching `term` at the start of any word.

    User-typed LIKE wildcards are escaped, so they match literally.
    """
    escaped = re.sub(r"([\\%_])", r"\\\1", term)
    return [f"{escaped}%"] + [f"%{sep}{escaped}%" for sep in WORD_SEPARATORS]


def style_ids_with_descendants(roots: Select, name: str) -> Select:
    """Ids of the styles selected by `roots` plus all their descendant styles.

    `name` must be unique within one statement.
    """
    tree = roots.cte(name, recursive=True)
    tree = tree.union(select(Style.id).where(Style.parent_style_id == tree.c.id))
    return select(tree.c.id)


def _term_condition(term: str, index: int) -> ColumnElement[bool]:
    patterns = _word_start_patterns(term)

    def matches(column) -> ColumnElement[bool]:
        return or_(*(column.ilike(pattern, escape=_ESCAPE) for pattern in patterns))

    matching_styles = style_ids_with_descendants(
        select(Style.id).where(matches(Style.name)), name=f"search_style_tree_{index}"
    )

    return or_(
        matches(Place.name),
        exists().where(
            PlaceArchitect.place_id == Place.id,
            PlaceArchitect.architect_id == Architect.id,
            matches(Architect.name),
        ),
        exists().where(
            PlaceStyle.place_id == Place.id,
            PlaceStyle.style_id.in_(matching_styles),
        ),
        exists().where(
            PlaceTag.place_id == Place.id,
            PlaceTag.tag_id == Tag.id,
            matches(Tag.name),
        ),
        exists().where(
            BuildingType.id == Place.building_type_id,
            matches(BuildingType.name),
        ),
    )


def search_condition(query: str) -> ColumnElement[bool]:
    """A condition on Place that is true when every word of `query` matches."""
    terms = split_terms(query)
    return and_(*(_term_condition(term, i) for i, term in enumerate(terms)))
