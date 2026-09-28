import { describe, expect, it, vi } from "vitest";

import { jsonResponse, makeDetail, makeSummary } from "@/test/fixtures";

import { getPlace, listPlacesInBounds } from "./places";

const bounds = { west: -71.12, south: 42.34, east: -71.05, north: 42.37 };

function mockJson(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (url: string) => {
    void url;
    return jsonResponse(body, status);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function list(items: unknown[]) {
  return { items, total: items.length, limit: 500, offset: 0 };
}

describe("listPlacesInBounds", () => {
  it("requests the viewport as a bbox parameter", async () => {
    const fetchMock = mockJson(list([]));

    await listPlacesInBounds(bounds);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/places");
    expect(url.searchParams.get("bbox")).toBe("-71.12,42.34,-71.05,42.37");
    expect(url.searchParams.get("limit")).toBe("500");
  });

  it("returns typed place summaries", async () => {
    mockJson(list([makeSummary()]));

    const result = await listPlacesInBounds(bounds);

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(makeSummary());
  });

  it("accepts a place with every optional value missing", async () => {
    const sparse = makeSummary({
      year_built_start: null,
      year_built_end: null,
      building_type: null,
      primary_style: null,
      architects: [],
      tours_available: null,
      significance_score: null,
      visit_minutes_exterior: null,
      visit_minutes_interior: null,
    });
    mockJson(list([sparse]));

    await expect(listPlacesInBounds(bounds)).resolves.toMatchObject({ items: [sparse] });
  });

  it.each([
    ["a missing name", { ...makeSummary(), name: undefined }],
    ["text coordinates", { ...makeSummary(), latitude: "42.36" }],
    ["an impossible latitude", { ...makeSummary(), latitude: 142 }],
    ["an impossible longitude", { ...makeSummary(), longitude: -271 }],
    ["an unknown access value", { ...makeSummary(), public_access: "sometimes" }],
    ["architects that are not a list", { ...makeSummary(), architects: "A. One" }],
  ])("rejects a place with %s", async (_, item) => {
    mockJson(list([item]));

    await expect(listPlacesInBounds(bounds)).rejects.toMatchObject({ kind: "malformed" });
  });

  it.each([[null], [[]], [{ items: "none" }], [{ places: [] }]])(
    "rejects the unexpected body %j",
    async (body) => {
      mockJson(body);

      await expect(listPlacesInBounds(bounds)).rejects.toMatchObject({ kind: "malformed" });
    },
  );
});

describe("getPlace", () => {
  it("requests the place by slug", async () => {
    const fetchMock = mockJson(makeDetail());

    const place = await getPlace("alpha-house");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/v1/places/alpha-house");
    expect(place.field_sources).toHaveLength(2);
    expect(place.curated.visit_minutes_exterior).toBe(15);
  });

  it("encodes the slug so it cannot change the request path", async () => {
    const fetchMock = mockJson(makeDetail());

    await getPlace("../filters?x=1");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/v1/places/..%2Ffilters%3Fx%3D1",
    );
  });

  it("reports a missing place with its status", async () => {
    mockJson({ detail: "Place not found" }, 404);

    await expect(getPlace("nowhere")).rejects.toMatchObject({ kind: "http", status: 404 });
  });

  it("rejects details with an unexpected shape", async () => {
    mockJson({ ...makeDetail(), curated: null });

    await expect(getPlace("alpha-house")).rejects.toMatchObject({ kind: "malformed" });
  });
});
