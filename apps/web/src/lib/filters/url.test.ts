import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS, type FilterState } from "./state";
import { parseFilters, serializeFilters } from "./url";

const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe("parseFilters", () => {
  it("reads an empty address as no filters", () => {
    expect(parse("")).toEqual(EMPTY_FILTERS);
  });

  it("reads every filter", () => {
    expect(
      parse(
        "q=richardson&style=modernism&style=federal&architect=alvar-aalto&building_type=chapel" +
          "&period=victorian&tag=brick&public_access=public&admission_type=free" +
          "&tours_available=true&year_from=1850&year_to=1900",
      ),
    ).toEqual({
      q: "richardson",
      style: ["modernism", "federal"],
      architect: ["alvar-aalto"],
      building_type: ["chapel"],
      period: ["victorian"],
      tag: ["brick"],
      public_access: ["public"],
      admission_type: ["free"],
      tours_available: true,
      year_from: 1850,
      year_to: 1900,
    });
  });

  it("ignores values that could not be valid", () => {
    const state = parse(
      "style=Not%20A%20Slug&style=ok&public_access=sometimes&admission_type=cheap" +
        "&tours_available=maybe&year_from=abc&year_to=99999&unknown=1",
    );

    expect(state).toEqual({ ...EMPTY_FILTERS, style: ["ok"] });
  });

  it("drops duplicates and caps long lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag=t${i}`).join("&");

    expect(parse("style=a&style=a").style).toEqual(["a"]);
    expect(parse(many).tag).toHaveLength(20);
  });

  it("caps an overlong search", () => {
    expect(parse(`q=${"x".repeat(500)}`).q).toHaveLength(100);
  });
});

describe("serializeFilters", () => {
  it("writes nothing for no filters", () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe("");
  });

  it("round-trips through the address", () => {
    const state: FilterState = {
      ...EMPTY_FILTERS,
      q: "henry hobson",
      style: ["federal", "modernism"],
      public_access: ["exterior_only"],
      tours_available: true,
      year_from: 1850,
    };

    expect(parse(serializeFilters(state))).toEqual(state);
  });

  it("keeps a search that is too long to send, so it is not lost", () => {
    const q = "a b c d e f g h i";

    expect(parse(serializeFilters({ ...EMPTY_FILTERS, q })).q).toBe(q);
  });
});
