import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  type FilterState,
  filterKey,
  filterReducer,
  hasAnyFilter,
  hasStructuredFilters,
  normalizeQuery,
  searchProblem,
  toApiParams,
} from "./state";

const withFilters = (overrides: Partial<FilterState>): FilterState => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

describe("filterReducer", () => {
  it("toggles a value on and off", () => {
    const on = filterReducer(EMPTY_FILTERS, { type: "toggle", group: "style", value: "modernism" });
    const off = filterReducer(on, { type: "toggle", group: "style", value: "modernism" });

    expect(on.style).toEqual(["modernism"]);
    expect(off.style).toEqual([]);
  });

  it("keeps groups independent", () => {
    let state = filterReducer(EMPTY_FILTERS, {
      type: "toggle",
      group: "style",
      value: "modernism",
    });
    state = filterReducer(state, { type: "toggle", group: "architect", value: "alvar-aalto" });

    expect(state.style).toEqual(["modernism"]);
    expect(state.architect).toEqual(["alvar-aalto"]);
  });

  it("sets and clears years", () => {
    let state = filterReducer(EMPTY_FILTERS, { type: "setYear", bound: "year_from", value: 1850 });
    state = filterReducer(state, { type: "setYear", bound: "year_to", value: 1900 });
    expect([state.year_from, state.year_to]).toEqual([1850, 1900]);

    state = filterReducer(state, { type: "clearYears" });
    expect([state.year_from, state.year_to]).toEqual([null, null]);
  });

  it("returns the same object when nothing changes, so nothing reloads", () => {
    const state = withFilters({ q: "trinity" });

    expect(filterReducer(state, { type: "setQuery", q: "trinity" })).toBe(state);
    expect(filterReducer(state, { type: "setYear", bound: "year_from", value: null })).toBe(state);
  });

  it("clears everything", () => {
    const state = withFilters({ q: "x", style: ["a"], tours_available: true, year_to: 1900 });

    expect(filterReducer(state, { type: "clearAll" })).toEqual(EMPTY_FILTERS);
  });
});

describe("search text", () => {
  it.each([
    ["  Trinity  ", "Trinity"],
    ["henry   hobson\trichardson", "henry hobson richardson"],
    ["   ", ""],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeQuery(raw)).toBe(expected);
  });

  it("flags more than eight distinct words", () => {
    expect(searchProblem("a b c d e f g h")).toBeNull();
    expect(searchProblem("a b c d e f g h i")).toBe("too-many-words");
    expect(searchProblem("a a a a a a a a a")).toBeNull();
  });
});

describe("toApiParams", () => {
  it("is empty when nothing is chosen", () => {
    expect(toApiParams(EMPTY_FILTERS)).toEqual({});
  });

  it("uses the API parameter names and sorts lists", () => {
    const params = toApiParams(
      withFilters({
        q: "  richardson ",
        style: ["modernism", "federal"],
        public_access: ["public"],
        admission_type: ["free", "paid"],
        tours_available: true,
        year_from: 1850,
        year_to: 1900,
      }),
    );

    expect(params).toEqual({
      q: "richardson",
      style: ["federal", "modernism"],
      public_access: ["public"],
      admission_type: ["free", "paid"],
      tours_available: "true",
      year_from: "1850",
      year_to: "1900",
    });
  });

  it("leaves out a reversed year range", () => {
    const params = toApiParams(withFilters({ year_from: 1950, year_to: 1900 }));

    expect(params.year_from).toBeUndefined();
    expect(params.year_to).toBeUndefined();
  });

  it("allows an open-ended year range", () => {
    expect(toApiParams(withFilters({ year_from: 1900 }))).toEqual({ year_from: "1900" });
    expect(toApiParams(withFilters({ year_to: 1900 }))).toEqual({ year_to: "1900" });
  });

  it("leaves out a search the API would reject", () => {
    expect(toApiParams(withFilters({ q: "a b c d e f g h i" })).q).toBeUndefined();
  });
});

describe("filterKey", () => {
  it("does not depend on the order choices were made in", () => {
    expect(filterKey(withFilters({ style: ["a", "b"] }))).toBe(
      filterKey(withFilters({ style: ["b", "a"] })),
    );
  });

  it("ignores whitespace-only differences in the search", () => {
    expect(filterKey(withFilters({ q: " trinity " }))).toBe(
      filterKey(withFilters({ q: "trinity" })),
    );
  });

  it("changes when the request would change", () => {
    expect(filterKey(withFilters({ style: ["a"] }))).not.toBe(
      filterKey(withFilters({ period: ["a"] })),
    );
  });
});

describe("activity", () => {
  it("tells search apart from structured filters", () => {
    expect(hasAnyFilter(withFilters({ q: "x" }))).toBe(true);
    expect(hasStructuredFilters(withFilters({ q: "x" }))).toBe(false);
    expect(hasStructuredFilters(withFilters({ year_to: 1900 }))).toBe(true);
    expect(hasAnyFilter(withFilters({ q: "   " }))).toBe(false);
  });
});
