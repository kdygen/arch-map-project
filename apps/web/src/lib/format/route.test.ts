import { describe, expect, it } from "vitest";

import {
  formatDistanceFromRoute,
  formatPlaceCount,
  formatRouteDistance,
  formatRouteDuration,
} from "./route";

describe("formatRouteDistance", () => {
  it.each([
    [4506, "2.8 mi"],
    [1609, "1.0 mi"],
    [200, "0.1 mi"],
    [100, "330 ft"],
    [0, "0 ft"],
    [32187, "20 mi"],
  ])("formats %i m as %s", (meters, expected) => {
    expect(formatRouteDistance(meters)).toBe(expected);
  });
});

describe("formatRouteDuration", () => {
  it.each([
    [3480, "58 min"],
    [3600, "1 hr"],
    [3900, "1 hr 5 min"],
    [20, "1 min"],
    [0, "1 min"],
  ])("formats %i s as %s", (seconds, expected) => {
    expect(formatRouteDuration(seconds)).toBe(expected);
  });
});

describe("formatDistanceFromRoute", () => {
  it.each([
    [0, "On your route"],
    [14, "On your route"],
    [44, "About 40 m from your route"],
    [83, "About 80 m from your route"],
    [118, "About 125 m from your route"],
    [244, "About 250 m from your route"],
  ])("formats %i m as %s", (meters, expected) => {
    expect(formatDistanceFromRoute(meters)).toBe(expected);
  });

  it("never claims to be a walking time", () => {
    expect(formatDistanceFromRoute(200)).not.toMatch(/min|walk/i);
  });
});

describe("formatPlaceCount", () => {
  it("uses singular and plural", () => {
    expect(formatPlaceCount(1)).toBe("1 place");
    expect(formatPlaceCount(3)).toBe("3 places");
    expect(formatPlaceCount(0)).toBe("0 places");
  });
});
