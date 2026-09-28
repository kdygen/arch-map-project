"""Text search, alone and combined with the other filters."""

import pytest

from app.catalog.search import (
    MAX_TERMS,
    SearchQueryError,
    _word_start_patterns,
    normalize_query,
    split_terms,
)


class TestNormalization:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Trinity", "Trinity"),
            ("  Trinity  ", "Trinity"),
            ("henry \t hobson\nrichardson", "henry hobson richardson"),
            ("", None),
            ("   ", None),
            (None, None),
        ],
    )
    def test_normalize_query(self, raw, expected):
        assert normalize_query(raw) == expected

    def test_terms_are_lowercased_and_deduplicated_in_order(self):
        assert split_terms("Brick MODERN brick") == ["brick", "modern"]

    def test_too_many_words_are_rejected(self):
        with pytest.raises(SearchQueryError, match="at most 8 words"):
            split_terms(" ".join(f"w{i}" for i in range(MAX_TERMS + 1)))

    def test_too_long_query_is_rejected(self):
        with pytest.raises(SearchQueryError, match="at most 100 characters"):
            split_terms("x" * 101)

    def test_like_wildcards_in_user_input_are_escaped(self):
        patterns = _word_start_patterns("50%_off\\")

        assert patterns[0] == "50\\%\\_off\\\\%"
        assert all("50\\%\\_off\\\\" in pattern for pattern in patterns)


def slugs(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["slug"] for item in response.json()["items"]]


def search(client, q, **params):
    return client.get("/api/v1/places", params={"q": q, **params})


@pytest.mark.integration
class TestSearchApi:
    @pytest.mark.parametrize(
        ("q", "expected"),
        [
            # Place name
            ("gamma", ["gamma-tower"]),
            ("Gamma Tower", ["gamma-tower"]),
            # Architect name
            ("three", ["gamma-tower"]),
            ("two", ["gamma-tower", "beta-hall"]),
            # Style name, including sub-styles of a matching parent style
            ("brutalism", ["gamma-tower"]),
            ("modernism", ["gamma-tower", "beta-hall"]),
            ("classical", ["alpha-house", "gamma-tower"]),
            # Tag name
            ("brick", ["gamma-tower", "beta-hall"]),
            # Building type name
            ("tower", ["gamma-tower"]),
            # Prefix of a word
            ("brut", ["gamma-tower"]),
            ("gam", ["gamma-tower"]),
        ],
    )
    def test_finds_places_by_searchable_text(self, seeded_client, q, expected):
        assert slugs(search(seeded_client, q)) == expected

    @pytest.mark.parametrize("q", ["GAMMA", "gAmMa", "  gamma  ", "\tgamma\n"])
    def test_is_case_insensitive_and_ignores_surrounding_whitespace(self, seeded_client, q):
        assert slugs(search(seeded_client, q)) == ["gamma-tower"]

    @pytest.mark.parametrize("q", ["", "   ", "\t"])
    def test_blank_search_means_no_search(self, seeded_client, q):
        response = search(seeded_client, q)

        assert slugs(response) == ["alpha-house", "gamma-tower", "beta-hall"]

    def test_matches_only_at_the_start_of_words(self, seeded_client):
        assert slugs(search(seeded_client, "amma")) == []
        assert slugs(search(seeded_client, "rutalism")) == []

    def test_every_word_must_match(self, seeded_client):
        assert slugs(search(seeded_client, "two brick")) == ["gamma-tower", "beta-hall"]
        assert slugs(search(seeded_client, "two dome")) == ["gamma-tower"]
        assert slugs(search(seeded_client, "alpha brick")) == []

    def test_words_may_match_different_fields(self, seeded_client):
        # "three" is an architect and "tower" is a building type.
        assert slugs(search(seeded_client, "three tower")) == ["gamma-tower"]

    def test_wildcard_characters_match_literally(self, seeded_client):
        assert slugs(search(seeded_client, "%")) == []
        assert slugs(search(seeded_client, "_")) == []
        assert slugs(search(seeded_client, "g%")) == []

    def test_no_match_returns_an_empty_list(self, seeded_client):
        response = search(seeded_client, "zeppelin")

        assert slugs(response) == []
        assert response.json()["total"] == 0

    def test_drafts_are_never_found(self, seeded_client):
        assert slugs(search(seeded_client, "delta")) == []
        assert "delta-draft" not in slugs(search(seeded_client, "one"))

    def test_combines_with_bounding_box(self, seeded_client):
        # This viewport holds alpha-house and beta-hall but not gamma-tower.
        response = search(seeded_client, "two", bbox="-71.07,42.35,-71.05,42.37")

        assert slugs(response) == ["beta-hall"]

    @pytest.mark.parametrize(
        ("q", "params", "expected"),
        [
            ("two", {"public_access": "public"}, ["gamma-tower"]),
            ("two", {"admission_type": "free"}, ["gamma-tower", "beta-hall"]),
            ("house", {"style": "modernism"}, ["beta-hall"]),
            ("two", {"year_to": 1960}, ["beta-hall"]),
            ("classical", {"period": "old"}, ["alpha-house"]),
            ("brick", {"building_type": "tower"}, ["gamma-tower"]),
            ("brick", {"architect": "b-two", "tag": "dome"}, ["gamma-tower"]),
            ("dome", {"tours_available": "true"}, ["alpha-house"]),
            ("alpha", {"style": "modernism"}, []),
        ],
    )
    def test_combines_with_filters(self, seeded_client, q, params, expected):
        response = search(seeded_client, q, **params)

        assert slugs(response) == expected
        assert response.json()["total"] == len(expected)

    def test_total_and_paging_respect_the_search(self, seeded_client):
        first = search(seeded_client, "two", limit=1)
        second = search(seeded_client, "two", limit=1, offset=1)

        assert slugs(first) == ["gamma-tower"]
        assert slugs(second) == ["beta-hall"]
        assert first.json()["total"] == second.json()["total"] == 2

    @pytest.mark.parametrize(
        "q",
        [
            " ".join(f"w{i}" for i in range(MAX_TERMS + 1)),
            "x" * 101,
            "x" * 201,
        ],
    )
    def test_oversized_search_is_rejected(self, seeded_client, q):
        response = search(seeded_client, q)

        assert response.status_code == 422

    def test_many_words_in_one_search_do_not_clash(self, seeded_client):
        # Several words produce several style subqueries. They must not clash.
        response = search(seeded_client, "two modernism brick tower")

        assert slugs(response) == ["gamma-tower"]


@pytest.mark.integration
class TestSearchOnRealData:
    """The scenarios from the Phase 4 brief, against the real seed data."""

    @pytest.fixture
    def client(self, db_session, catalog_client):
        from app.seeding.importer import import_seed
        from app.seeding.loader import load_seed
        from tests.test_real_seed_data import REAL_SEED_DIR

        import_seed(db_session, load_seed(REAL_SEED_DIR))
        return catalog_client

    @pytest.mark.parametrize(
        ("q", "expected"),
        [
            ("Trinity", ["trinity-church-boston"]),
            ("Richardson", ["trinity-church-boston"]),
            ("modernism", ["mit-chapel", "baker-house"]),
            ("MIT", ["mit-chapel"]),
            ("aalto", ["baker-house"]),
            ("victorian", ["trinity-church-boston", "gibson-house-museum"]),
        ],
    )
    def test_brief_examples(self, client, q, expected):
        assert slugs(search(client, q)) == expected

    def test_combined_example(self, client):
        response = search(client, "MIT", style="modernism", public_access="public")

        assert slugs(response) == ["mit-chapel"]
