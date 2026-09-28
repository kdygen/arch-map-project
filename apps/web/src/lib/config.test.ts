import { describe, expect, it, vi } from "vitest";

import { DEMO_MAP_ID, getMapsConfig } from "./config";

describe("getMapsConfig", () => {
  it("reports a missing key as null", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", undefined);

    expect(getMapsConfig().apiKey).toBeNull();
  });

  it.each(["", "   "])("treats the blank key %j as missing", (value) => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", value);

    expect(getMapsConfig().apiKey).toBeNull();
  });

  it("uses the configured key and map ID", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", " test-key ");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAP_ID", "my-map");

    expect(getMapsConfig()).toEqual({ apiKey: "test-key", mapId: "my-map" });
  });

  it("falls back to Google's demo map ID", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAP_ID", "");

    expect(getMapsConfig().mapId).toBe(DEMO_MAP_ID);
  });
});
