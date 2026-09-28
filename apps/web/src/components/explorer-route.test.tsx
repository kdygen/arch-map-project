import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, makeDetail, makeSummary } from "@/test/fixtures";
import { makeFilterOptions } from "@/test/fixtures-filters";
import { placesStub, resetPlacesStub, stubState } from "@/test/google-maps-stub";

import { Explorer } from "./explorer";

vi.mock("@vis.gl/react-google-maps", () => import("@/test/google-maps-stub"));

const config = { apiKey: "test-key", mapId: "test-map" };
const boston = { west: -71.12, south: 42.34, east: -71.05, north: 42.37 };

// Fictional endpoints and places. Nothing here is real data.
const LOCATIONS = [
  { id: "loc-campus", main: "Campus Gate", secondary: "Testville, MA", lat: 42.36, lng: -71.1 },
  { id: "loc-park", main: "Park Fountain", secondary: "Testville, MA", lat: 42.36, lng: -71.05 },
  { id: "loc-parkway", main: "Parkway Diner", secondary: "Testville, MA", lat: 42.3, lng: -71.0 },
];
// Google's documented example polyline, three points.
const POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
// A two-point line, used for driving.
const DRIVING_POLYLINE = "_p~iF~ps|U_ulLnnqC";

const alpha = makeSummary({ slug: "alpha-house", name: "Alpha House" });
const beta = makeSummary({
  slug: "beta-hall",
  name: "Beta Hall",
  latitude: 42.35,
  longitude: -71.09,
  primary_style: { slug: "modernism", name: "Modernism" },
  architects: [{ slug: "b-two", name: "B. Two", role: "architect" }],
});
const gamma = makeSummary({
  slug: "gamma-tower",
  name: "Gamma Tower",
  latitude: 42.3,
  longitude: -71.2,
});

type Api = {
  route?: (body: RouteBody) => Response | Promise<Response>;
  nearby?: (body: NearbyBody) => Response | Promise<Response>;
};
type RouteBody = {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travel_mode: string;
};
type NearbyBody = { polyline: string; filters: Record<string, unknown> };

function mockApi({ route, nearby }: Api = {}) {
  const calls = {
    route: [] as RouteBody[],
    nearby: [] as NearbyBody[],
    viewport: [] as string[],
    other: [] as string[],
  };
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    if (url.pathname === "/api/v1/filters") return jsonResponse(makeFilterOptions());
    if (url.pathname === "/api/v1/routes") {
      calls.route.push(body);
      if (route) return route(body);
      const driving = body.travel_mode === "driving";
      return jsonResponse({
        route: {
          // A different line per direction and per mode, so changes are visible.
          polyline: driving
            ? DRIVING_POLYLINE
            : body.origin.lng < body.destination.lng
              ? POLYLINE
              : "_ibE_seK_seK_seK",
          distance_meters: driving ? 6437 : 4506,
          duration_seconds: driving ? 900 : 3480,
          travel_mode: body.travel_mode,
          warnings: driving ? [] : ["Walking directions may not reflect real-world conditions."],
        },
      });
    }
    if (url.pathname === "/api/v1/routes/nearby-places") {
      calls.nearby.push(body);
      if (nearby) return nearby(body);
      const styles = (body.filters.style as string[] | undefined) ?? [];
      const q = (body.filters.q as string | undefined)?.toLowerCase();
      const items = [
        { place: beta, distance_from_route_meters: 83, route_progress: 0.2 },
        { place: alpha, distance_from_route_meters: 8, route_progress: 0.7 },
      ].filter(
        (item) =>
          (styles.length === 0 || styles.includes(item.place.primary_style?.slug ?? "")) &&
          (!q || item.place.name.toLowerCase().includes(q)),
      );
      return jsonResponse({ items, total: items.length, corridor_meters: 500 });
    }
    if (url.pathname === "/api/v1/places") {
      calls.viewport.push(url.search);
      const items = [alpha, beta, gamma];
      return jsonResponse({ items, total: items.length, limit: 500, offset: 0 });
    }
    calls.other.push(url.pathname);
    return jsonResponse(makeDetail({ slug: "beta-hall", name: "Beta Hall" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

async function openRouteMode() {
  const user = userEvent.setup();
  render(
    <Explorer
      config={config}
      debounceMs={0}
      searchDebounceMs={0}
      suggestionDebounceMs={0}
      syncUrl={false}
    />,
  );
  act(() => stubState.emitBounds({ ...boston, west: -71.3, south: 42.2 }));
  await screen.findAllByTestId("marker");
  await user.click(screen.getByRole("button", { name: "Route" }));
  return user;
}

type User = ReturnType<typeof userEvent.setup>;
const from = () => screen.getByRole("combobox", { name: "From" });
const to = () => screen.getByRole("combobox", { name: "To" });
const findRoute = () => screen.getByRole("button", { name: /Find route|Finding route/ });
const panel = () => screen.getByRole("complementary", { name: "Explore places" });
const markerNames = () =>
  screen.queryAllByTestId("marker").map((m) => m.getAttribute("aria-label"));
const routeList = () =>
  within(screen.getByRole("region", { name: "Architecture near your route" }));

async function choose(user: User, input: HTMLElement, text: string, option: RegExp) {
  await user.clear(input);
  await user.type(input, text);
  await user.click(await screen.findByRole("option", { name: option }));
}

async function chooseBoth(user: User) {
  await choose(user, from(), "Campus", /Campus Gate/);
  await choose(user, to(), "Park F", /Park Fountain/);
}

async function findARoute(user: User) {
  await chooseBoth(user);
  await user.click(findRoute());
  await screen.findByRole("heading", { name: "Walking route" });
}

beforeEach(() => resetPlacesStub(LOCATIONS));

describe("Route mode", () => {
  it("starts in Explore mode and sends no route request on page load", async () => {
    const calls = mockApi();
    render(<Explorer config={config} debounceMs={0} searchDebounceMs={0} syncUrl={false} />);
    act(() => stubState.emitBounds(boston));
    await screen.findAllByTestId("marker");

    expect(screen.getByRole("button", { name: "Explore" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("combobox", { name: "From" })).not.toBeInTheDocument();
    expect(calls.route).toEqual([]);
    expect(placesStub.inputs).toEqual([]);
  });

  it("shows the route form with walking chosen and driving available", async () => {
    mockApi();
    await openRouteMode();

    expect(from()).toBeInTheDocument();
    expect(to()).toBeInTheDocument();
    const modes = within(screen.getByRole("group", { name: "Travel mode" }));
    expect(modes.getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual([
      "walking",
      "driving",
    ]);
    expect(modes.getByRole("radio", { name: /Walking/ })).toBeChecked();
    expect(modes.getByRole("radio", { name: /Driving/ })).not.toBeChecked();
    expect(screen.queryByText(/Transit|Bicycling/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Route" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps showing the architecture in view until a route is found", async () => {
    mockApi();
    await openRouteMode();

    expect(markerNames()).toEqual(["Alpha House", "Beta Hall", "Gamma Tower"]);
  });
});

describe("Choosing endpoints", () => {
  it("suggests locations from the Places service", async () => {
    mockApi();
    const user = await openRouteMode();

    await user.type(from(), "Park");

    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Park FountainTestville, MA",
      "Parkway DinerTestville, MA",
    ]);
    expect(from()).toHaveAttribute("aria-expanded", "true");
  });

  it("biases suggestions toward the catalog area without restricting them", async () => {
    mockApi();
    const user = await openRouteMode();

    await user.type(from(), "Park");
    await screen.findAllByRole("option");

    const request = placesStub.requests.at(-1)!;
    expect(request.locationBias).toEqual({ center: { lat: 42.3545, lng: -71.08 }, radius: 30000 });
    expect(request).not.toHaveProperty("locationRestriction");
  });

  it("does not search for a single character", async () => {
    mockApi();
    const user = await openRouteMode();

    await user.type(from(), "P");

    expect(placesStub.inputs).toEqual([]);
  });

  it("stores the chosen origin with coordinates", async () => {
    const calls = mockApi();
    const user = await openRouteMode();

    await chooseBoth(user);
    await user.click(findRoute());
    await screen.findByRole("heading", { name: "Walking route" });

    expect(from()).toHaveValue("Campus Gate");
    expect(to()).toHaveValue("Park Fountain");
    expect(calls.route).toEqual([
      {
        origin: { lat: 42.36, lng: -71.1 },
        destination: { lat: 42.36, lng: -71.05 },
        travel_mode: "walking",
      },
    ]);
  });

  it("asks Places only for the location of the chosen place", async () => {
    mockApi();
    const user = await openRouteMode();

    await choose(user, from(), "Campus", /Campus Gate/);

    expect(placesStub.lookups).toEqual([{ id: "loc-campus", fields: ["location"] }]);
  });

  it("uses one session per search and a new one after a choice", async () => {
    mockApi();
    const user = await openRouteMode();

    await choose(user, from(), "Campus", /Campus Gate/);
    await choose(user, to(), "Park F", /Park Fountain/);

    const tokens = placesStub.requests.map((r) => (r.token as { number: number }).number);
    expect(
      new Set(tokens.filter((_, i) => placesStub.requests[i].input.startsWith("C"))).size,
    ).toBe(1);
    expect(placesStub.tokens).toBe(2);
  });

  it("says in words that a location is selected", async () => {
    mockApi();
    const user = await openRouteMode();

    expect(within(panel()).getAllByText("Type a place or address.")).toHaveLength(2);
    await choose(user, from(), "Campus", /Campus Gate/);

    expect(within(panel()).getByText("✓ Location selected")).toBeInTheDocument();
  });

  it("can choose a suggestion with the keyboard", async () => {
    mockApi();
    const user = await openRouteMode();

    await user.type(from(), "Park");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => expect(from()).toHaveValue("Parkway Diner"));
  });

  it("closes the suggestions with Escape", async () => {
    mockApi();
    const user = await openRouteMode();
    await user.type(from(), "Park");
    await screen.findAllByRole("option");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(from()).toHaveAttribute("aria-expanded", "false");
  });

  it("explains when nothing is found", async () => {
    mockApi();
    const user = await openRouteMode();

    await user.type(from(), "Zzzz");

    expect(
      await within(panel()).findByText("No locations found. Try different words."),
    ).toBeInTheDocument();
  });

  it("explains when the location search fails", async () => {
    mockApi();
    placesStub.failSuggest = true;
    const user = await openRouteMode();

    await user.type(from(), "Park");

    expect(await within(panel()).findByText(/Location search failed/)).toBeInTheDocument();
    expect(findRoute()).toBeDisabled();
  });

  it("explains when a chosen place cannot be loaded", async () => {
    mockApi();
    placesStub.failLookup = true;
    const user = await openRouteMode();

    await user.type(from(), "Campus");
    await user.click(await screen.findByRole("option", { name: /Campus Gate/ }));

    expect(await within(panel()).findByText(/could not be loaded/)).toBeInTheDocument();
    expect(findRoute()).toBeDisabled();
  });
});

describe("Editing invalidates the selection", () => {
  it("disables Find route again when the text is edited", async () => {
    mockApi();
    const user = await openRouteMode();
    await chooseBoth(user);
    expect(findRoute()).toBeEnabled();

    await user.type(from(), "{Backspace}");

    expect(findRoute()).toBeDisabled();
    expect(
      within(panel()).getByText("Choose a location from the suggestions."),
    ).toBeInTheDocument();
  });

  it("never routes from the coordinates of an earlier choice", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await chooseBoth(user);

    await choose(user, from(), "Parkway", /Parkway Diner/);
    await user.click(findRoute());
    await screen.findByRole("heading", { name: "Walking route" });

    expect(calls.route).toHaveLength(1);
    expect(calls.route[0].origin).toEqual({ lat: 42.3, lng: -71.0 });
  });

  it("cannot be submitted with the Enter key while a field is only typed", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await choose(user, from(), "Campus", /Campus Gate/);

    await user.type(to(), "Somewhere typed by hand");
    await user.keyboard("{Escape}{Enter}");

    expect(calls.route).toEqual([]);
  });
});

describe("Find route", () => {
  it("is disabled until both endpoints are chosen", async () => {
    mockApi();
    const user = await openRouteMode();

    expect(findRoute()).toBeDisabled();
    await choose(user, from(), "Campus", /Campus Gate/);
    expect(findRoute()).toBeDisabled();
    await choose(user, to(), "Park F", /Park Fountain/);
    expect(findRoute()).toBeEnabled();
  });

  it("refuses the same place twice and says why", async () => {
    const calls = mockApi();
    const user = await openRouteMode();

    await choose(user, from(), "Campus", /Campus Gate/);
    await choose(user, to(), "Campus", /Campus Gate/);

    expect(findRoute()).toBeDisabled();
    expect(within(panel()).getByText(/From and To are the same place/)).toBeInTheDocument();
    expect(calls.route).toEqual([]);
  });

  it("sends no route request while typing or choosing", async () => {
    const calls = mockApi();
    const user = await openRouteMode();

    await chooseBoth(user);

    expect(calls.route).toEqual([]);
  });

  it("shows a loading state and ignores repeated clicks", async () => {
    let release: (response: Response) => void = () => {};
    const calls = mockApi({ route: () => new Promise<Response>((resolve) => (release = resolve)) });
    const user = await openRouteMode();
    await chooseBoth(user);

    await user.click(findRoute());

    expect(findRoute()).toBeDisabled();
    expect(findRoute()).toHaveTextContent("Finding route…");
    expect(screen.getByText("Finding your walking route…")).toBeInTheDocument();
    await user.click(findRoute());
    await user.click(findRoute());
    await user.type(to(), "{Enter}");
    expect(calls.route).toHaveLength(1);

    await act(async () =>
      release(
        jsonResponse({
          route: {
            polyline: POLYLINE,
            distance_meters: 1,
            duration_seconds: 60,
            travel_mode: "walking",
            warnings: [],
          },
        }),
      ),
    );
    await screen.findByRole("heading", { name: "Walking route" });
  });

  it("does not request the route that is already shown", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);

    await user.click(findRoute());

    expect(calls.route).toHaveLength(1);
  });
});

describe("Showing the route", () => {
  it("summarizes distance and time", async () => {
    mockApi();
    const user = await openRouteMode();

    await findARoute(user);

    const summary = within(screen.getByRole("heading", { name: "Walking route" }).parentElement!);
    expect(summary.getByText("2.8 mi · 58 min")).toBeInTheDocument();
    expect(summary.getByText(/Campus Gate/)).toHaveTextContent("Campus Gate → to Park Fountain");
    expect(summary.getByText(/may not reflect real-world conditions/)).toBeInTheDocument();
  });

  it("draws the route with labeled origin and destination", async () => {
    mockApi();
    const user = await openRouteMode();

    await findARoute(user);

    expect(screen.getAllByTestId("route-line")[0]).toHaveAttribute("data-points", "3");
    expect(screen.getByRole("img", { name: "Origin: Campus Gate" })).toHaveAttribute(
      "data-lng",
      "-71.1",
    );
    expect(screen.getByRole("img", { name: "Destination: Park Fountain" })).toHaveAttribute(
      "data-lng",
      "-71.05",
    );
  });

  it("swaps the endpoints and routes the other way on request", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);

    await user.click(screen.getByRole("button", { name: /Swap from and to/ }));

    expect(from()).toHaveValue("Park Fountain");
    expect(to()).toHaveValue("Campus Gate");
    // Swapping alone costs nothing.
    expect(calls.route).toHaveLength(1);

    await user.click(findRoute());

    await screen.findByRole("img", { name: "Origin: Park Fountain" });
    expect(calls.route).toHaveLength(2);
    expect(calls.route[1].origin).toEqual({ lat: 42.36, lng: -71.05 });
    expect(screen.getByRole("img", { name: "Destination: Campus Gate" })).toBeInTheDocument();
  });
});

describe("Architecture near the route", () => {
  it("comes from the corridor query, in route order", async () => {
    const calls = mockApi();
    const user = await openRouteMode();

    await findARoute(user);

    const items = await routeList().findAllByRole("listitem");
    expect(
      items.map((li) => within(li).getByRole("button").querySelector("strong")!.textContent),
    ).toEqual(["Beta Hall", "Alpha House"]);
    expect(calls.nearby[0]).toEqual({ polyline: POLYLINE, filters: {}, limit: 500 });
    expect(routeList().getByText("2 places near your route")).toBeInTheDocument();
  });

  it("shows only the corridor places as markers", async () => {
    mockApi();
    const user = await openRouteMode();
    expect(markerNames()).toContain("Gamma Tower");

    await findARoute(user);

    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall", "Alpha House"]));
  });

  it("describes distance as a straight line, not as walking time", async () => {
    mockApi();
    const user = await openRouteMode();

    await findARoute(user);

    expect(await routeList().findByText("About 80 m from your route")).toBeInTheDocument();
    expect(routeList().getByText("On your route")).toBeInTheDocument();
    expect(
      routeList().getByText(/straight lines, so the actual trip to a place can be longer/),
    ).toBeInTheDocument();
    expect(routeList().queryByText(/min detour|minute detour/i)).not.toBeInTheDocument();
  });

  it("selects the marker when a result is clicked, and opens details", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);

    await user.click(await routeList().findByRole("button", { name: /Beta Hall/ }));

    expect(screen.getByRole("button", { name: "Beta Hall, selected" })).toBeInTheDocument();
    expect(within(panel()).getByRole("heading", { name: "Beta Hall" })).toBeInTheDocument();
    expect(screen.getAllByTestId("route-line")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "View details for Beta Hall" }));
    expect(await screen.findByText("A fictional house used in tests.")).toBeInTheDocument();
    expect(calls.other).toEqual(["/api/v1/places/beta-hall"]);
  });

  it("shows the result when a marker is clicked", async () => {
    mockApi();
    const user = await openRouteMode();
    await findARoute(user);
    await routeList().findAllByRole("listitem");

    await user.click(screen.getByRole("button", { name: "Alpha House" }));

    expect(within(panel()).getByRole("heading", { name: "Alpha House" })).toBeInTheDocument();
  });

  it("explains a route with no architecture nearby", async () => {
    mockApi({ nearby: () => jsonResponse({ items: [], total: 0, corridor_meters: 500 }) });
    const user = await openRouteMode();

    await findARoute(user);

    expect(
      await routeList().findByText("No architecture has been added near this route yet."),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("route-line")).toHaveLength(2);
  });

  it("keeps the route when the places fail to load, and can retry", async () => {
    let healthy = false;
    mockApi({
      nearby: () =>
        healthy
          ? jsonResponse({ items: [], total: 0, corridor_meters: 500 })
          : jsonResponse({ detail: "down" }, 500),
    });
    const user = await openRouteMode();
    await findARoute(user);

    const alert = await screen.findByText(/Places near your route could not be loaded/);
    expect(screen.getAllByTestId("route-line")).toHaveLength(2);

    healthy = true;
    await user.click(
      within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", {
        name: "Try again",
      }),
    );

    expect(
      await routeList().findByText(/No architecture has been added near this route/),
    ).toBeInTheDocument();
  });
});

describe("Filters with a route", () => {
  async function openStyle(user: User) {
    await user.click(within(panel()).getByText("Filters", { selector: "summary" }));
    await user.click(within(panel()).getByText("Style", { selector: "summary" }));
  }

  it("narrow the places near the route without asking for a new route", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);
    await routeList().findAllByRole("listitem");

    await openStyle(user);
    await user.click(screen.getByRole("checkbox", { name: "Modernism" }));

    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));
    expect(routeList().getByText("1 place near your route")).toBeInTheDocument();
    expect(calls.nearby.at(-1)).toEqual({
      polyline: POLYLINE,
      filters: { style: ["modernism"] },
      limit: 500,
    });
    expect(calls.route).toHaveLength(1);
  });

  it("keep architecture search separate from the endpoint fields", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);

    await user.type(
      screen.getByRole("searchbox", { name: "Filter architecture by name, architect, or style" }),
      "alpha",
    );

    await waitFor(() => expect(markerNames()).toEqual(["Alpha House"]));
    expect(from()).toHaveValue("Campus Gate");
    expect(to()).toHaveValue("Park Fountain");
    expect(calls.route).toHaveLength(1);
    expect(placesStub.inputs.every((input) => !input.toLowerCase().includes("alpha"))).toBe(true);
  });

  it("explain an empty filtered result and offer to clear filters", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);

    await user.type(screen.getByRole("searchbox"), "zeppelin");

    expect(
      await routeList().findByText("No places near your route match these filters."),
    ).toBeInTheDocument();
    await user.click(routeList().getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(markerNames()).toHaveLength(2));
    expect(calls.route).toHaveLength(1);
  });
});

describe("Clearing and leaving the route", () => {
  it("clears the route and returns to exploring the map", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);
    await waitFor(() => expect(markerNames()).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: "Clear route" }));

    expect(screen.queryByTestId("route-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("endpoint-marker")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Walking route" })).not.toBeInTheDocument();
    expect(from()).toHaveValue("");
    expect(to()).toHaveValue("");
    await waitFor(() => expect(markerNames()).toEqual(["Alpha House", "Beta Hall", "Gamma Tower"]));
    expect(calls.route).toHaveLength(1);
  });

  it("hides the route in Explore mode and brings it back for free", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);

    await user.click(screen.getByRole("button", { name: "Explore" }));

    expect(screen.queryByTestId("route-line")).not.toBeInTheDocument();
    await waitFor(() => expect(markerNames()).toHaveLength(3));
    expect(screen.getByRole("searchbox", { name: "Search architecture" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Route" }));

    expect(screen.getAllByTestId("route-line")).toHaveLength(2);
    expect(from()).toHaveValue("Campus Gate");
    expect(calls.route).toHaveLength(1);
  });
});

describe("When routing fails", () => {
  it.each([
    ["no_route", 422, "No walking route was found between these places."],
    [
      "routing_not_configured",
      503,
      "Routing is not set up on the server yet. The map and search still work.",
    ],
    ["routing_quota_exceeded", 503, "The route service is busy. Try again in a moment."],
    ["routing_timeout", 504, "The route service took too long to answer. Try again."],
    ["routing_unavailable", 502, "The route could not be calculated. Try again later."],
  ])("explains %s", async (code, status, message) => {
    mockApi({ route: () => jsonResponse({ detail: "internal wording", code }, status) });
    const user = await openRouteMode();
    await chooseBoth(user);

    await user.click(findRoute());

    const alert = (await screen.findByText("The route could not be found.")).closest(
      "[role=alert]",
    )!;
    expect(alert).toHaveTextContent(message);
  });

  it("leaves the rest of the explorer usable and allows another try", async () => {
    let healthy = false;
    const calls = mockApi({
      route: () =>
        healthy
          ? jsonResponse({
              route: {
                polyline: POLYLINE,
                distance_meters: 1,
                duration_seconds: 60,
                travel_mode: "walking",
                warnings: [],
              },
            })
          : jsonResponse({ detail: "x", code: "routing_unavailable" }, 502),
    });
    const user = await openRouteMode();
    await chooseBoth(user);
    await user.click(findRoute());
    await screen.findByText("The route could not be found.");

    expect(screen.getByTestId("google-map")).toBeInTheDocument();
    expect(markerNames()).toHaveLength(3);
    expect(screen.queryByTestId("route-line")).not.toBeInTheDocument();
    expect(findRoute()).toBeEnabled();

    healthy = true;
    await user.click(findRoute());

    await screen.findByRole("heading", { name: "Walking route" });
    expect(calls.route).toHaveLength(2);
  });

  it("explains an unreachable backend", async () => {
    mockApi({
      route: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const user = await openRouteMode();
    await chooseBoth(user);

    await user.click(findRoute());

    expect(await screen.findByText(/route service cannot be reached/)).toBeInTheDocument();
  });
});

describe("When location search is not available", () => {
  it("explains a Places library without the new autocomplete", async () => {
    mockApi();
    placesStub.available = false;
    const user = await openRouteMode();

    expect(within(panel()).getAllByText("Location search is unavailable.")).toHaveLength(2);
    expect(from()).toBeDisabled();
    expect(findRoute()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Explore" }));
    expect(markerNames()).toHaveLength(3);
  });

  it("explains a missing Google Maps key", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<Explorer config={{ apiKey: null, mapId: "test-map" }} syncUrl={false} />);

    await user.click(screen.getByRole("button", { name: "Route" }));

    expect(within(panel()).getAllByText("Location search is unavailable.")).toHaveLength(2);
    expect(screen.getByText("Google Maps is not configured")).toBeInTheDocument();
    expect(calls.route).toEqual([]);
  });
});

describe("Travel mode", () => {
  const mode = (name: RegExp) => screen.getByRole("radio", { name });

  it("sends walking by default", async () => {
    const calls = mockApi();
    const user = await openRouteMode();

    await findARoute(user);

    expect(calls.route[0].travel_mode).toBe("walking");
    expect(screen.getByRole("heading", { name: "Walking route" })).toBeInTheDocument();
  });

  it("sends driving when chosen and shows the driving route", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await chooseBoth(user);

    await user.click(mode(/Driving/));
    await user.click(findRoute());

    const heading = await screen.findByRole("heading", { name: "Driving route" });
    expect(calls.route).toEqual([
      {
        origin: { lat: 42.36, lng: -71.1 },
        destination: { lat: 42.36, lng: -71.05 },
        travel_mode: "driving",
      },
    ]);
    expect(within(heading.parentElement!).getByText("4.0 mi · 15 min")).toBeInTheDocument();
    expect(screen.getAllByTestId("route-line")[0]).toHaveAttribute("data-points", "2");
  });

  it("finds architecture near a driving route with the same corridor search", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await chooseBoth(user);
    await user.click(mode(/Driving/));

    await user.click(findRoute());

    await routeList().findAllByRole("listitem");
    expect(calls.nearby.at(-1)).toEqual({ polyline: DRIVING_POLYLINE, filters: {}, limit: 500 });
    expect(routeList().getByText(/within about 500 m of the route/)).toBeInTheDocument();
  });

  it("changing the mode removes the shown route without a new request", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);

    await user.click(mode(/Driving/));

    expect(screen.queryByRole("heading", { name: "Walking route" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("route-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("endpoint-marker")).not.toBeInTheDocument();
    expect(calls.route).toHaveLength(1);
    // The chosen places stay, so pressing Find route is enough.
    expect(from()).toHaveValue("Campus Gate");
    expect(to()).toHaveValue("Park Fountain");
    expect(findRoute()).toBeEnabled();
  });

  it("requires Find route again after changing the mode", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);
    await user.click(mode(/Driving/));

    await user.click(findRoute());

    await screen.findByRole("heading", { name: "Driving route" });
    expect(calls.route.map((r) => r.travel_mode)).toEqual(["walking", "driving"]);
  });

  it("switching back to the previous mode also needs Find route", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await findARoute(user);
    await user.click(mode(/Driving/));

    await user.click(mode(/Walking/));

    expect(screen.queryByTestId("route-line")).not.toBeInTheDocument();
    expect(calls.route).toHaveLength(1);
    await user.click(findRoute());
    await screen.findByRole("heading", { name: "Walking route" });
    expect(calls.route.map((r) => r.travel_mode)).toEqual(["walking", "walking"]);
  });

  it("cannot be changed while a route is being found", async () => {
    let release: (response: Response) => void = () => {};
    const calls = mockApi({ route: () => new Promise<Response>((resolve) => (release = resolve)) });
    const user = await openRouteMode();
    await chooseBoth(user);
    await user.click(findRoute());

    expect(mode(/Driving/)).toBeDisabled();
    await act(async () =>
      release(
        jsonResponse({
          route: {
            polyline: POLYLINE,
            distance_meters: 1,
            duration_seconds: 60,
            travel_mode: "walking",
            warnings: [],
          },
        }),
      ),
    );
    await screen.findByRole("heading", { name: "Walking route" });
    expect(calls.route).toHaveLength(1);
  });

  it("keeps the chosen mode when swapping", async () => {
    const calls = mockApi();
    const user = await openRouteMode();
    await chooseBoth(user);
    await user.click(mode(/Driving/));

    await user.click(screen.getByRole("button", { name: /Swap from and to/ }));
    await user.click(findRoute());

    await screen.findByRole("heading", { name: "Driving route" });
    expect(mode(/Driving/)).toBeChecked();
    expect(calls.route[0]).toMatchObject({ travel_mode: "driving", origin: { lng: -71.05 } });
  });

  it("names the mode in a no-route error", async () => {
    mockApi({ route: () => jsonResponse({ detail: "x", code: "no_route" }, 422) });
    const user = await openRouteMode();
    await chooseBoth(user);
    await user.click(mode(/Driving/));

    await user.click(findRoute());

    const alert = (await screen.findByText("The route could not be found.")).closest(
      "[role=alert]",
    )!;
    expect(alert).toHaveTextContent("No driving route was found between these places.");
  });

  it("can be chosen with the keyboard", async () => {
    mockApi();
    const user = await openRouteMode();

    mode(/Walking/).focus();
    await user.keyboard("{ArrowRight}");

    expect(mode(/Driving/)).toBeChecked();
  });
});
