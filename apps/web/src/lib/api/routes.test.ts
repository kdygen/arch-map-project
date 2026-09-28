import { describe, expect, it, vi } from "vitest";

import { jsonResponse, makeSummary } from "@/test/fixtures";

import { computeRoute, listPlacesNearRoute, toFilterBody } from "./routes";

const mit = {
  label: "MIT (typed text must not be sent)",
  lat: 42.3601,
  lng: -71.0942,
  placeId: "p1",
};
const common = { label: "Boston Common", lat: 42.355, lng: -71.0655 };
const routeBody = {
  route: {
    polyline: "abc",
    distance_meters: 3120,
    duration_seconds: 2534,
    travel_mode: "walking",
    warnings: ["Use caution."],
  },
};

function mockJson(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    void url;
    void init;
    return jsonResponse(body, status);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof mockJson>) =>
  JSON.parse(fetchMock.mock.calls[0][1]!.body as string);

describe("computeRoute", () => {
  it("posts only coordinates and the travel mode to our backend", async () => {
    const fetchMock = mockJson(routeBody);

    await computeRoute(mit, common, "walking");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/v1/routes");
    expect(fetchMock.mock.calls[0][1]!.method).toBe("POST");
    expect(sentBody(fetchMock)).toEqual({
      origin: { lat: 42.3601, lng: -71.0942 },
      destination: { lat: 42.355, lng: -71.0655 },
      travel_mode: "walking",
    });
  });

  it("sends the driving mode when chosen", async () => {
    const fetchMock = mockJson({ route: { ...routeBody.route, travel_mode: "driving" } });

    const route = await computeRoute(mit, common, "driving");

    expect(sentBody(fetchMock).travel_mode).toBe("driving");
    expect(route.travelMode).toBe("driving");
  });

  it("never calls Google directly and sends no key", async () => {
    const fetchMock = mockJson(routeBody);

    await computeRoute(mit, common, "walking");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("googleapis.com");
    expect(JSON.stringify(init).toLowerCase()).not.toContain("key");
  });

  it("returns the route with its endpoints", async () => {
    mockJson(routeBody);

    expect(await computeRoute(mit, common, "walking")).toEqual({
      polyline: "abc",
      distanceMeters: 3120,
      durationSeconds: 2534,
      travelMode: "walking",
      warnings: ["Use caution."],
      origin: mit,
      destination: common,
    });
  });

  it("carries the error code and message from the backend", async () => {
    mockJson({ detail: "No walking route was found between these places.", code: "no_route" }, 422);

    await expect(computeRoute(mit, common, "walking")).rejects.toMatchObject({
      kind: "http",
      status: 422,
      code: "no_route",
      detail: "No walking route was found between these places.",
    });
  });

  it("copes with an error that has no readable body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })),
    );

    await expect(computeRoute(mit, common, "walking")).rejects.toMatchObject({
      kind: "http",
      status: 502,
      code: undefined,
    });
  });

  it.each([
    [{ route: { ...routeBody.route, polyline: "" } }],
    [{ route: { ...routeBody.route, distance_meters: -1 } }],
    [{ route: { ...routeBody.route, travel_mode: "transit" } }],
    [{ polyline: "abc" }],
  ])("rejects the unexpected response %j", async (body) => {
    mockJson(body);

    await expect(computeRoute(mit, common, "walking")).rejects.toMatchObject({ kind: "malformed" });
  });
});

describe("listPlacesNearRoute", () => {
  const item = { place: makeSummary(), distance_from_route_meters: 80, route_progress: 0.25 };

  it("posts the route line and filters to our backend", async () => {
    const fetchMock = mockJson({ items: [item], total: 1, corridor_meters: 500 });

    const result = await listPlacesNearRoute("abc", { q: "mit", style: ["modernism"] });

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/v1/routes/nearby-places");
    expect(sentBody(fetchMock)).toEqual({
      polyline: "abc",
      filters: { q: "mit", style: ["modernism"] },
      limit: 500,
    });
    expect(result.items[0].place.slug).toBe("alpha-house");
  });

  it("rejects an unexpected response", async () => {
    mockJson({ items: [{ ...item, route_progress: 2 }], total: 1, corridor_meters: 500 });

    await expect(listPlacesNearRoute("abc")).rejects.toMatchObject({ kind: "malformed" });
  });
});

describe("toFilterBody", () => {
  it("sends numbers and booleans as JSON types", () => {
    expect(
      toFilterBody({
        q: "x",
        tours_available: "true",
        year_from: "1850",
        year_to: "1900",
        tag: ["a"],
      }),
    ).toEqual({ q: "x", tours_available: true, year_from: 1850, year_to: 1900, tag: ["a"] });
  });

  it("sends nothing for no filters", () => {
    expect(toFilterBody({})).toEqual({});
  });
});
