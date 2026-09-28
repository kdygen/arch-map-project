import { describe, expect, it } from "vitest";

import { makeSummary } from "@/test/fixtures";

import { isCovered, placesInViewport } from "./viewport";

const wide = { west: -71.12, south: 42.34, east: -71.05, north: 42.37 };
const zoomedIn = { west: -71.07, south: 42.355, east: -71.055, north: 42.365 };

describe("isCovered", () => {
  const loaded = { bounds: wide, places: [], complete: true, filterKey: "style=modernism" };

  it("is false before anything was loaded", () => {
    expect(isCovered(null, wide, "")).toBe(false);
  });

  it("is true when zooming in on a complete result with the same filters", () => {
    expect(isCovered(loaded, zoomedIn, "style=modernism")).toBe(true);
  });

  it("is false when the filters are different", () => {
    expect(isCovered(loaded, zoomedIn, "")).toBe(false);
    expect(isCovered(loaded, zoomedIn, "style=federal")).toBe(false);
  });

  it("is false when the earlier result was only one page", () => {
    expect(isCovered({ ...loaded, complete: false }, zoomedIn, "style=modernism")).toBe(false);
  });

  it("is false when panning outside the loaded area", () => {
    const moved = { ...wide, west: -71.2, east: -71.1 };

    expect(isCovered(loaded, moved, "style=modernism")).toBe(false);
  });
});

describe("placesInViewport", () => {
  it("keeps only the places inside the viewport, in order", () => {
    const places = [
      makeSummary({ slug: "inside", latitude: 42.36, longitude: -71.06 }),
      makeSummary({ slug: "outside", latitude: 42.36, longitude: -71.09 }),
    ];

    expect(placesInViewport(places, zoomedIn).map((p) => p.slug)).toEqual(["inside"]);
  });
});
