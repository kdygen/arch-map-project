import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_FILTERS, type FilterState } from "@/lib/filters/state";
import { jsonResponse, makeDetail, makeSummary } from "@/test/fixtures";
import { makeFilterOptions } from "@/test/fixtures-filters";
import { stubState } from "@/test/google-maps-stub";

import { Explorer } from "./explorer";

vi.mock("@vis.gl/react-google-maps", () => import("@/test/google-maps-stub"));

const config = { apiKey: "test-key", mapId: "test-map" };
const boston = { west: -71.12, south: 42.34, east: -71.05, north: 42.37 };
const paris = { west: 2.2, south: 48.8, east: 2.4, north: 48.9 };

const alpha = makeSummary({ slug: "alpha-house", name: "Alpha House" });
const beta = makeSummary({
  slug: "beta-hall",
  name: "Beta Hall",
  latitude: 42.35,
  longitude: -71.09,
  year_built_start: 1949,
  year_built_end: null,
  building_type: { slug: "hall", name: "Hall" },
  primary_style: { slug: "modernism", name: "Modernism" },
  architects: [{ slug: "b-two", name: "B. Two", role: "architect" }],
  public_access: "exterior_only",
  admission_type: "unknown",
});

/**
 * A fake API. The browser never filters: the fake server decides what matches,
 * the way the real API does, so tests check that parameters are sent.
 */
function serverMatches(params: URLSearchParams) {
  const q = params.get("q")?.toLowerCase();
  const styles = params.getAll("style");
  const access = params.getAll("public_access");
  const bbox = params.get("bbox") ?? "";
  return [alpha, beta].filter(
    (place) =>
      bbox.startsWith("-71") &&
      (!q ||
        place.name.toLowerCase().includes(q) ||
        place.architects.some((a) => a.name.toLowerCase().includes(q))) &&
      (styles.length === 0 || styles.includes(place.primary_style?.slug ?? "")) &&
      (access.length === 0 || access.includes(place.public_access)),
  );
}

type Api = {
  places?: (params: URLSearchParams) => Response | Promise<Response>;
  detail?: (slug: string) => Response;
  filters?: () => Response;
};

function mockApi({ places, detail, filters }: Api = {}) {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/api/v1/filters") {
      return filters ? filters() : jsonResponse(makeFilterOptions());
    }
    if (url.pathname === "/api/v1/places") {
      if (places) return places(url.searchParams);
      const items = serverMatches(url.searchParams);
      return jsonResponse({ items, total: items.length, limit: 500, offset: 0 });
    }
    const slug = url.pathname.split("/").pop() ?? "";
    if (detail) return detail(slug);
    return jsonResponse(
      makeDetail({ slug, name: slug === "beta-hall" ? "Beta Hall" : "Alpha House" }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const placeRequests = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(url))
    .filter((url) => url.pathname === "/api/v1/places");

const lastPlaceRequest = (fetchMock: ReturnType<typeof mockApi>) =>
  placeRequests(fetchMock).at(-1)!;

const detailCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([url]) => url).filter((url) => /\/places\/[^?]+$/.test(url));

async function openMap(initialFilters: FilterState = EMPTY_FILTERS, bounds = boston) {
  const user = userEvent.setup();
  render(
    <Explorer
      config={config}
      debounceMs={0}
      searchDebounceMs={0}
      syncUrl={false}
      initialFilters={initialFilters}
    />,
  );
  act(() => stubState.emitBounds(bounds));
  return user;
}

const panel = () => screen.getByRole("complementary", { name: "Explore places" });
const status = () => screen.getByRole("status");
const marker = (name: string) => screen.getByRole("button", { name });
const markerNames = () =>
  screen.queryAllByTestId("marker").map((m) => m.getAttribute("aria-label"));
const resultList = () => screen.queryByRole("list", { name: "Places in this map area" });

async function openFilterGroup(user: ReturnType<typeof userEvent.setup>, title: string) {
  const filters = within(panel()).getByText("Filters", { selector: "summary" }).closest("details")!;
  if (!filters.open) await user.click(within(filters).getByText("Filters", { selector: "summary" }));
  const summary = await within(panel()).findByText(title, { selector: "summary" });
  const group = summary.closest("details")!;
  if (!group.open) await user.click(summary);
  return within(group);
}

describe("Explorer markers", () => {
  it("shows a marker for each place the API returns for the viewport", async () => {
    const fetchMock = mockApi();

    await openMap();

    expect(await screen.findAllByTestId("marker")).toHaveLength(2);
    expect(status()).toHaveTextContent("2 places found in this map area");
    expect(lastPlaceRequest(fetchMock).searchParams.get("bbox")).toBe("-71.12,42.34,-71.05,42.37");
  });

  it("says that it is loading before the first result arrives", async () => {
    let release: (response: Response) => void = () => {};
    mockApi({ places: () => new Promise<Response>((resolve) => (release = resolve)) });
    render(<Explorer config={config} debounceMs={0} searchDebounceMs={0} syncUrl={false} />);

    expect(status()).toHaveTextContent("Waiting for the map");
    act(() => stubState.emitBounds(boston));
    await waitFor(() => expect(status()).toHaveTextContent("Loading places"));

    await act(async () =>
      release(jsonResponse({ items: [alpha], total: 1, limit: 500, offset: 0 })),
    );
    expect(await screen.findAllByTestId("marker")).toHaveLength(1);
  });

  it("explains an area with no architecture yet and recovers when the map returns", async () => {
    mockApi();
    await openMap();
    await screen.findAllByTestId("marker");

    act(() => stubState.emitBounds(paris));
    await waitFor(() =>
      expect(status()).toHaveTextContent("No architecture has been added in this area yet"),
    );
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    act(() => stubState.emitBounds(boston));
    expect(await screen.findAllByTestId("marker")).toHaveLength(2);
  });

  it("uses singular wording for one place", async () => {
    mockApi({ places: () => jsonResponse({ items: [alpha], total: 1, limit: 500, offset: 0 }) });

    await openMap();

    await waitFor(() => expect(status()).toHaveTextContent("1 place found in this map area"));
  });
});

describe("Explorer search", () => {
  it("sends the search to the API and shows only what it returns", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.type(screen.getByRole("searchbox", { name: "Search architecture" }), "beta");

    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));
    const request = lastPlaceRequest(fetchMock);
    expect(request.searchParams.get("q")).toBe("beta");
    expect(request.searchParams.get("bbox")).toBe("-71.12,42.34,-71.05,42.37");
    expect(status()).toHaveTextContent("1 place found");
  });

  it("finds places by architect through the API", async () => {
    mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.type(screen.getByRole("searchbox"), "Two");

    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));
  });

  it("trims and collapses whitespace before sending", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.type(screen.getByRole("searchbox"), "   beta    hall  ");

    await waitFor(() =>
      expect(lastPlaceRequest(fetchMock).searchParams.get("q")).toBe("beta hall"),
    );
  });

  it("treats a blank search as no search", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");
    const before = placeRequests(fetchMock).length;

    await user.type(screen.getByRole("searchbox"), "     ");

    expect(placeRequests(fetchMock)).toHaveLength(before);
    expect(markerNames()).toHaveLength(2);
  });

  it("does not send more words than the API accepts, and says why", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.type(screen.getByRole("searchbox"), "a b c d e f g h i");

    expect(screen.getByText(/Search uses up to 8 words/)).toBeInTheDocument();
    expect(
      placeRequests(fetchMock).every(
        (url) => !url.searchParams.has("q") || url.searchParams.get("q")!.split(" ").length <= 8,
      ),
    ).toBe(true);
  });

  it("can clear the search", async () => {
    mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");
    await user.type(screen.getByRole("searchbox"), "beta");
    await waitFor(() => expect(markerNames()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    await waitFor(() => expect(markerNames()).toHaveLength(2));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
});

describe("Explorer search debounce", () => {
  it("sends one request after typing stops, not one per keystroke", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = mockApi();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: 50 });
      render(<Explorer config={config} debounceMs={0} searchDebounceMs={300} syncUrl={false} />);
      act(() => stubState.emitBounds(boston));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      const before = placeRequests(fetchMock).length;

      await user.type(screen.getByRole("searchbox"), "richardson");
      expect(placeRequests(fetchMock)).toHaveLength(before);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      const after = placeRequests(fetchMock).slice(before);
      expect(after.map((url) => url.searchParams.get("q"))).toEqual(["richardson"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Explorer filters", () => {
  it("keeps the filter panel and its groups closed until opened", async () => {
    mockApi();
    await openMap({ ...EMPTY_FILTERS, style: ["modernism"] });

    const filters = within(panel()).getByText("Filters", { selector: "summary" }).closest("details")!;
    expect(filters.open).toBe(false);
    expect(within(filters).getByText("1 active")).toBeInTheDocument();
  });

  it("offers choices loaded from the filters endpoint", async () => {
    const fetchMock = mockApi();
    const user = await openMap();

    const style = await openFilterGroup(user, "Style");

    expect(style.getByRole("checkbox", { name: "Modernism" })).toBeInTheDocument();
    expect(style.getByRole("checkbox", { name: "Classical" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/api/v1/filters"))).toBe(true);
  });

  it("applies a style filter through the API", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    const style = await openFilterGroup(user, "Style");
    await user.click(style.getByRole("checkbox", { name: "Modernism" }));

    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));
    expect(lastPlaceRequest(fetchMock).searchParams.getAll("style")).toEqual(["modernism"]);
  });

  it("sends every kind of filter with the right parameter names", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.click(
      (await openFilterGroup(user, "Architect")).getByRole("checkbox", { name: "B. Two" }),
    );
    await user.click(
      (await openFilterGroup(user, "Building type")).getByRole("checkbox", { name: "Hall" }),
    );
    await user.click(
      (await openFilterGroup(user, "Period")).getByRole("checkbox", { name: "New (1900–present)" }),
    );
    await user.click(
      (await openFilterGroup(user, "Public access")).getByRole("checkbox", {
        name: "Open to the public",
      }),
    );
    await user.click(
      (await openFilterGroup(user, "Admission")).getByRole("checkbox", { name: "Paid" }),
    );
    await user.click(
      (await openFilterGroup(user, "Tours")).getByRole("checkbox", { name: "Tours available" }),
    );
    await user.click(
      (await openFilterGroup(user, "Features")).getByRole("checkbox", { name: "Dome" }),
    );
    const years = await openFilterGroup(user, "Construction year");
    await user.type(years.getByRole("spinbutton", { name: "From" }), "1850");
    await user.type(years.getByRole("spinbutton", { name: "To" }), "1900");

    await waitFor(() =>
      expect(lastPlaceRequest(fetchMock).searchParams.get("year_to")).toBe("1900"),
    );
    const params = lastPlaceRequest(fetchMock).searchParams;
    expect(params.getAll("architect")).toEqual(["b-two"]);
    expect(params.getAll("building_type")).toEqual(["hall"]);
    expect(params.getAll("period")).toEqual(["new"]);
    expect(params.getAll("public_access")).toEqual(["public"]);
    expect(params.getAll("admission_type")).toEqual(["paid"]);
    expect(params.get("tours_available")).toBe("true");
    expect(params.getAll("tag")).toEqual(["dome"]);
    expect(params.get("year_from")).toBe("1850");
    expect(params.get("bbox")).toBe("-71.12,42.34,-71.05,42.37");
  });

  it("repeats a parameter for several choices in one group", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    const style = await openFilterGroup(user, "Style");
    await user.click(style.getByRole("checkbox", { name: "Modernism" }));
    await user.click(style.getByRole("checkbox", { name: "Classical" }));

    await waitFor(() =>
      expect(lastPlaceRequest(fetchMock).searchParams.getAll("style")).toEqual([
        "classical",
        "modernism",
      ]),
    );
    await waitFor(() => expect(markerNames()).toHaveLength(2));
  });

  it("combines search and filters", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.type(screen.getByRole("searchbox"), "hall");
    const access = await openFilterGroup(user, "Public access");
    await user.click(access.getByRole("checkbox", { name: "Open to the public" }));

    await waitFor(() => expect(status()).toHaveTextContent("No places match these filters"));
    const params = lastPlaceRequest(fetchMock).searchParams;
    expect(params.get("q")).toBe("hall");
    expect(params.getAll("public_access")).toEqual(["public"]);
  });

  it("does not apply a reversed year range and explains why", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    const years = await openFilterGroup(user, "Construction year");
    await user.type(years.getByRole("spinbutton", { name: "From" }), "1950");
    await user.type(years.getByRole("spinbutton", { name: "To" }), "1900");

    expect(await years.findByText(/start year is after the end year/)).toBeInTheDocument();
    const params = lastPlaceRequest(fetchMock).searchParams;
    expect(params.has("year_to")).toBe(false);
  });

  it("shows active filters in words and removes one from its chip", async () => {
    mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");
    await user.click(
      (await openFilterGroup(user, "Style")).getByRole("checkbox", { name: "Modernism" }),
    );
    await user.click(
      (await openFilterGroup(user, "Admission")).getByRole("checkbox", { name: "Not confirmed" }),
    );

    const chips = within(screen.getByRole("list", { name: "Active filters" }));
    expect(chips.getByRole("button", { name: /Style: Modernism/ })).toBeInTheDocument();
    expect(chips.getByRole("button", { name: /Admission: Not confirmed/ })).toBeInTheDocument();
    expect(screen.getByText("2 active")).toBeInTheDocument();

    await user.click(chips.getByRole("button", { name: /Style: Modernism/ }));

    expect(screen.queryByRole("button", { name: /Style: Modernism/ })).not.toBeInTheDocument();
    expect(
      (await openFilterGroup(user, "Style")).getByRole("checkbox", { name: "Modernism" }),
    ).not.toBeChecked();
  });

  it("clears every filter and the search at once", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");
    await user.type(screen.getByRole("searchbox"), "beta");
    await user.click(
      (await openFilterGroup(user, "Style")).getByRole("checkbox", { name: "Modernism" }),
    );
    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    await waitFor(() => expect(markerNames()).toHaveLength(2));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    const params = lastPlaceRequest(fetchMock).searchParams;
    expect([...params.keys()].sort()).toEqual(["bbox", "limit"]);
  });

  it("explains an empty filtered result differently and offers Clear filters", async () => {
    mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.type(screen.getByRole("searchbox"), "zeppelin");

    await waitFor(() =>
      expect(status()).toHaveTextContent("No places match these filters in the current map area."),
    );
    expect(screen.getByTestId("google-map")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(markerNames()).toHaveLength(2));
  });

  it("keeps filters when the map moves away and back", async () => {
    const fetchMock = mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");
    await user.click(
      (await openFilterGroup(user, "Style")).getByRole("checkbox", { name: "Modernism" }),
    );
    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));

    act(() => stubState.emitBounds(paris));
    await waitFor(() => expect(status()).toHaveTextContent("No places match these filters"));
    expect(lastPlaceRequest(fetchMock).searchParams.getAll("style")).toEqual(["modernism"]);

    act(() => stubState.emitBounds(boston));
    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));
    expect(lastPlaceRequest(fetchMock).searchParams.getAll("style")).toEqual(["modernism"]);
  });

  it("starts from filters passed in, such as from the page address", async () => {
    const fetchMock = mockApi();

    await openMap({ ...EMPTY_FILTERS, q: "beta", style: ["modernism"] });

    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));
    const params = placeRequests(fetchMock)[0].searchParams;
    expect(params.get("q")).toBe("beta");
    expect(params.getAll("style")).toEqual(["modernism"]);
    expect(screen.getByRole("searchbox")).toHaveValue("beta");
  });

  it("still searches when the filter options cannot be loaded", async () => {
    let healthy = false;
    mockApi({
      filters: () =>
        healthy ? jsonResponse(makeFilterOptions()) : jsonResponse({ detail: "down" }, 500),
    });
    const user = await openMap();

    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent("Filter choices could not be loaded.");
    await user.type(screen.getByRole("searchbox"), "beta");
    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));

    healthy = true;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await openFilterGroup(user, "Style")).toBeTruthy();
  });

  it("clears the selection when the filters change", async () => {
    mockApi();
    const user = await openMap();
    await user.click(await screen.findByRole("button", { name: "Alpha House" }));
    expect(within(panel()).getByRole("heading", { name: "Alpha House" })).toBeInTheDocument();

    await user.click(
      (await openFilterGroup(user, "Style")).getByRole("checkbox", { name: "Modernism" }),
    );

    await waitFor(() => expect(markerNames()).toEqual(["Beta Hall"]));
    expect(within(panel()).queryByRole("heading", { name: "Alpha House" })).not.toBeInTheDocument();
  });
});

describe("Explorer results and markers stay in sync", () => {
  it("lists the matching places", async () => {
    mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.type(screen.getByRole("searchbox"), "beta");

    await waitFor(() => expect(within(resultList()!).getAllByRole("button")).toHaveLength(1));
    expect(within(resultList()!).getByRole("button", { name: /Beta Hall/ })).toHaveTextContent(
      "Modernism · B. Two · 1949",
    );
  });

  it("selecting a result selects its marker", async () => {
    mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    await user.click(within(resultList()!).getByRole("button", { name: /Beta Hall/ }));

    expect(marker("Beta Hall, selected")).toBeInTheDocument();
    expect(within(panel()).getByRole("heading", { name: "Beta Hall" })).toBeInTheDocument();
  });

  it("selecting a marker shows its result", async () => {
    mockApi();
    const user = await openMap();

    await user.click(await screen.findByRole("button", { name: "Beta Hall" }));

    expect(within(panel()).getByRole("heading", { name: "Beta Hall" })).toBeInTheDocument();
  });
});

describe("Explorer selection", () => {
  it("shows a preview of the clicked marker", async () => {
    mockApi();
    const user = await openMap();

    await user.click(await screen.findByRole("button", { name: "Beta Hall" }));

    const preview = within(
      within(panel()).getByRole("heading", { name: "Beta Hall" }).closest("article")!,
    );
    expect(preview.getByText("1949")).toBeInTheDocument();
    expect(preview.getByText("Modernism")).toBeInTheDocument();
    expect(preview.getByText("B. Two")).toBeInTheDocument();
    expect(preview.getByText("Exterior viewing only")).toBeInTheDocument();
    expect(preview.getByText("Admission not confirmed")).toBeInTheDocument();
    expect(marker("Beta Hall, selected")).toBeInTheDocument();
  });

  it("needs no extra request for the preview", async () => {
    const fetchMock = mockApi();
    const user = await openMap();

    await user.click(await screen.findByRole("button", { name: "Alpha House" }));

    expect(detailCalls(fetchMock)).toEqual([]);
  });

  it("switches the preview when another marker is clicked", async () => {
    mockApi();
    const user = await openMap();
    await user.click(await screen.findByRole("button", { name: "Alpha House" }));

    await user.click(marker("Beta Hall"));

    expect(within(panel()).getByRole("heading", { name: "Beta Hall" })).toBeInTheDocument();
    expect(within(panel()).queryByRole("heading", { name: "Alpha House" })).not.toBeInTheDocument();
    expect(marker("Alpha House")).toBeInTheDocument();
  });

  it("can select a place from the list with the keyboard", async () => {
    mockApi();
    const user = await openMap();
    await screen.findAllByTestId("marker");

    within(resultList()!)
      .getByRole("button", { name: /Beta Hall/ })
      .focus();
    await user.keyboard("{Enter}");

    expect(within(panel()).getByRole("heading", { name: "Beta Hall" })).toBeInTheDocument();
  });

  it("clears the selection from the close button and from the empty map", async () => {
    mockApi();
    const user = await openMap();

    await user.click(await screen.findByRole("button", { name: "Alpha House" }));
    await user.click(screen.getByRole("button", { name: /^Close/ }));
    expect(within(panel()).queryByRole("heading", { name: "Alpha House" })).not.toBeInTheDocument();

    await user.click(marker("Alpha House"));
    await user.click(screen.getByRole("button", { name: "empty map area" }));
    expect(within(panel()).queryByRole("heading", { name: "Alpha House" })).not.toBeInTheDocument();
  });

  it("keeps the selected place and its marker when the map moves away", async () => {
    mockApi();
    const user = await openMap();
    await user.click(await screen.findByRole("button", { name: "Alpha House" }));

    act(() => stubState.emitBounds(paris));
    await waitFor(() => expect(status()).toHaveTextContent("No architecture has been added"));

    expect(within(panel()).getByRole("heading", { name: "Alpha House" })).toBeInTheDocument();
    expect(marker("Alpha House, selected")).toBeInTheDocument();
  });
});

describe("Explorer details", () => {
  async function openDetails(api: Api = {}) {
    const fetchMock = mockApi(api);
    const user = await openMap();
    await user.click(await screen.findByRole("button", { name: "Alpha House" }));
    await user.click(screen.getByRole("button", { name: /View details/ }));
    return { user, fetchMock };
  }

  it("loads details from the place endpoint only when asked", async () => {
    const { fetchMock } = await openDetails();

    await screen.findByText("A fictional house used in tests.");

    expect(detailCalls(fetchMock)).toEqual(["http://localhost:8000/api/v1/places/alpha-house"]);
  });

  it("shows the place information in readable form", async () => {
    await openDetails();
    const details = within(panel());

    expect(await details.findByText("A fictional house used in tests.")).toBeInTheDocument();
    expect(details.getByText("Important to the test suite.")).toBeInTheDocument();
    expect(details.getByText("1795–1800")).toBeInTheDocument();
    expect(details.getByText("1 Test Street, Testville")).toBeInTheDocument();
    expect(details.getByText("Ticket required.")).toBeInTheDocument();
    expect(details.getByText("10:00 AM – 12:00 PM, 1:00 PM – 5:00 PM")).toBeInTheDocument();
    expect(details.getByRole("link", { name: /Official website/ })).toHaveAttribute(
      "href",
      "https://example.org/alpha",
    );
  });

  it("presents visit durations as our estimates", async () => {
    await openDetails();

    expect(await screen.findByText("About 15 min")).toBeInTheDocument();
    expect(screen.getByText("About 1 hr")).toBeInTheDocument();
    expect(
      screen.getByText(/our own estimates, not information from the venue/),
    ).toBeInTheDocument();
  });

  it("lists sources with what they support", async () => {
    await openDetails();

    const link = await screen.findByRole("link", { name: "Example reference" });
    expect(link).toHaveAttribute("href", "https://example.org/reference");
    expect(screen.getByText(/Supports: construction date, architects/)).toBeInTheDocument();
  });

  it("does not show raw field names or internal scores", async () => {
    await openDetails();
    const about = await screen.findByText("A fictional house used in tests.");

    const text = about.closest("article")?.textContent ?? "";
    for (const raw of [
      "year_built",
      "field_sources",
      "significance_score",
      "official_site",
      "null",
    ]) {
      expect(text).not.toContain(raw);
    }
  });

  it("moves focus to the details heading", async () => {
    await openDetails();

    expect(screen.getByRole("heading", { name: "Alpha House" })).toHaveFocus();
  });

  it("returns to the preview", async () => {
    const { user } = await openDetails();
    await screen.findByText("A fictional house used in tests.");

    await user.click(screen.getByRole("button", { name: /Back to preview/ }));

    expect(screen.getByRole("button", { name: /View details/ })).toBeInTheDocument();
  });

  it("explains a failed detail request and recovers on retry", async () => {
    let healthy = false;
    const { user } = await openDetails({
      detail: () => (healthy ? jsonResponse(makeDetail()) : jsonResponse({ detail: "boom" }, 500)),
    });

    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent("The details could not be loaded.");
    expect(screen.getAllByTestId("marker")).toHaveLength(2);

    healthy = true;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("A fictional house used in tests.")).toBeInTheDocument();
  });

  it("explains a place that no longer exists", async () => {
    await openDetails({ detail: () => jsonResponse({ detail: "Place not found" }, 404) });

    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent("This place is no longer available.");
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Explorer when the API is down", () => {
  it("explains the problem and keeps the map usable", async () => {
    mockApi({
      places: () => {
        throw new TypeError("Failed to fetch");
      },
    });

    await openMap();

    await waitFor(() => expect(screen.getByText(/Places could not be loaded/)).toBeInTheDocument());
    expect(screen.getByText(/It may not be running/)).toBeInTheDocument();
    expect(screen.getByTestId("google-map")).toBeInTheDocument();
    expect(resultList()).not.toBeInTheDocument();
  });

  it("loads the places after a retry", async () => {
    let online = false;
    mockApi({
      places: () => {
        if (!online) throw new TypeError("Failed to fetch");
        return jsonResponse({ items: [alpha], total: 1, limit: 500, offset: 0 });
      },
    });
    const user = await openMap();
    const message = await screen.findByText(/Places could not be loaded/);

    online = true;
    await user.click(
      within(message.closest("[role=alert]") as HTMLElement).getByRole("button", {
        name: "Try again",
      }),
    );

    expect(await screen.findAllByTestId("marker")).toHaveLength(1);
    expect(screen.queryByText(/Places could not be loaded/)).not.toBeInTheDocument();
  });

  it("explains a response it cannot read", async () => {
    mockApi({ places: () => jsonResponse({ unexpected: true }) });

    await openMap();

    expect(await screen.findByText(/a response we could not read/)).toBeInTheDocument();
  });
});

describe("Explorer without a Google Maps key", () => {
  it("shows setup help and requests no places", () => {
    const fetchMock = mockApi();

    render(<Explorer config={{ apiKey: null, mapId: "test-map" }} syncUrl={false} />);

    expect(screen.getByText("Google Maps is not configured")).toBeInTheDocument();
    expect(placeRequests(fetchMock)).toHaveLength(0);
  });
});

describe("Explorer accessible names", () => {
  it("gives every button a readable name with proper spacing", async () => {
    mockApi();
    const user = await openMap();
    await user.type(screen.getByRole("searchbox"), "alpha");
    await user.click(
      (await openFilterGroup(user, "Style")).getByRole("checkbox", { name: "Classical" }),
    );
    await user.click(await screen.findByRole("button", { name: "Alpha House" }));

    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter: Style: Classical" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close preview of Alpha House" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View details for Alpha House" }),
    ).toBeInTheDocument();
  });
});
