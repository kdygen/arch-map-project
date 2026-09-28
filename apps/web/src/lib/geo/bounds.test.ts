import { describe, expect, it } from "vitest";

import {
  containsBounds,
  containsPoint,
  isValidBounds,
  normalizeBounds,
  toBboxParam,
} from "./bounds";

const boston = { west: -71.12, south: 42.34, east: -71.05, north: 42.37 };

describe("toBboxParam", () => {
  it("orders values as west,south,east,north", () => {
    expect(toBboxParam(boston)).toBe("-71.12,42.34,-71.05,42.37");
  });

  it("rounds to four decimals so map jitter gives the same value", () => {
    const a = toBboxParam({ west: -71.120001, south: 42.34, east: -71.05, north: 42.37 });
    const b = toBboxParam({ west: -71.11999, south: 42.34, east: -71.05, north: 42.37 });

    expect(a).toBe(b);
  });

  it("clamps values outside the valid range, as a zoomed-out map can report", () => {
    expect(toBboxParam({ west: -200, south: -95, east: 200, north: 95 })).toBe("-180,-90,180,90");
  });

  it("keeps west greater than east for a box across the antimeridian", () => {
    expect(toBboxParam({ west: 179, south: -18, east: -179, north: -16 })).toBe("179,-18,-179,-16");
  });

  it("never writes negative zero", () => {
    expect(toBboxParam({ west: -0.00001, south: 0, east: 1, north: 1 })).toBe("0,0,1,1");
  });
});

describe("normalizeBounds", () => {
  it("returns plain numbers", () => {
    expect(normalizeBounds({ west: 1.23456789, south: 2, east: 3, north: 4 }).west).toBe(1.2346);
  });
});

describe("isValidBounds", () => {
  it("accepts a normal box", () => {
    expect(isValidBounds(boston)).toBe(true);
  });

  it.each([
    { ...boston, west: Number.NaN },
    { ...boston, north: Number.POSITIVE_INFINITY },
    { ...boston, south: 50, north: 40 },
  ])("rejects %o", (bounds) => {
    expect(isValidBounds(bounds)).toBe(false);
  });
});

describe("containsPoint", () => {
  it("is true inside and on the edge", () => {
    expect(containsPoint(boston, 42.36, -71.06)).toBe(true);
    expect(containsPoint(boston, 42.34, -71.12)).toBe(true);
  });

  it("is false outside", () => {
    expect(containsPoint(boston, 42.36, -71.2)).toBe(false);
    expect(containsPoint(boston, 42.5, -71.06)).toBe(false);
  });

  it("handles a box across the antimeridian", () => {
    const fiji = { west: 179, south: -18, east: -179, north: -16 };

    expect(containsPoint(fiji, -17, 179.5)).toBe(true);
    expect(containsPoint(fiji, -17, -179.5)).toBe(true);
    expect(containsPoint(fiji, -17, 0)).toBe(false);
  });
});

describe("containsBounds", () => {
  it("is true for a box zoomed in from the outer one", () => {
    const inner = { west: -71.1, south: 42.35, east: -71.06, north: 42.36 };

    expect(containsBounds(boston, inner)).toBe(true);
    expect(containsBounds(boston, boston)).toBe(true);
  });

  it("is false when the inner box sticks out on any side", () => {
    expect(containsBounds(boston, { ...boston, east: -71.0 })).toBe(false);
    expect(containsBounds(boston, { ...boston, south: 42.3 })).toBe(false);
  });

  it("is conservatively false near the antimeridian", () => {
    const fiji = { west: 179, south: -18, east: -179, north: -16 };

    expect(containsBounds(fiji, fiji)).toBe(false);
  });
});
