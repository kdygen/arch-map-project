import { describe, expect, it } from "vitest";

import { boundsOf, decodePolyline } from "./polyline";

describe("decodePolyline", () => {
  it("decodes the example from Google's documentation", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it("returns no points for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it.each(["_p~iF", "_p~iF~ps|", "hello world", "éé"])(
    "returns no points for the malformed input %j",
    (encoded) => {
      expect(decodePolyline(encoded)).toEqual([]);
    },
  );
});

describe("boundsOf", () => {
  it("is the smallest box around the points", () => {
    expect(
      boundsOf([
        { lat: 42.36, lng: -71.09 },
        { lat: 42.35, lng: -71.06 },
        { lat: 42.37, lng: -71.07 },
      ]),
    ).toEqual({ west: -71.09, south: 42.35, east: -71.06, north: 42.37 });
  });

  it("is null without points", () => {
    expect(boundsOf([])).toBeNull();
  });
});
