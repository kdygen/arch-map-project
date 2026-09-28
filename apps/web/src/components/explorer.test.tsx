import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { stubState } from "@/test/google-maps-stub";
import { jsonResponse, makeDetail, makeSummary } from "@/test/fixtures";

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
  primary_style: { slug: "modernism", name: "Modernism" },
  architects: [{ slug: "b-two", name: "B. Two", role: "architect" }],
  public_access: "exterior_only",
  admission_type: "unknown",
});

type Api = {
  places?: (bbox: string) => Response | Promise<Response>;
  detail?: (slug: string) => Response;
};

function mockApi({ places, detail }: Api = {}) {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/api/v1/places") {
      const bbox = url.searchParams.get("bbox") ?? "";
      if (places) return places(bbox);
      const items = bbox.startsWith("-71") ? [alpha, beta] : [];
      return jsonResponse({ items, total: items.length, limit: 500, offset: 0 });
    }
    const slug = url.pathname.split("/").pop() ?? "";
    if (detail) return detail(slug);
    return jsonResponse(makeDetail({ slug, name: slug === "beta-hall" ? "Beta Hall" : "Alpha House" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const detailCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([url]) => !url.includes("/places?")).map(([url]) => url);

async function openMap(bounds = boston) {
  const user = userEvent.setup();
  render(<Explorer config={config} debounceMs={0} />);
  act(() => stubState.emitBounds(bounds));
  return user;
}

const panel = () => screen.getByRole("complementary", { name: "Places" });
const marker = (name: string) => screen.getByRole("button", { name });

describe("Explorer markers", () => {
  it("shows a marker for each place the API returns for the viewport", async () => {
    const fetchMock = mockApi();

    await openMap();

    expect(await screen.findAllByTestId("marker")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("2 places in view");
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("bbox")).toBe(
      "-71.12,42.34,-71.05,42.37",
    );
  });

  it("says that it is loading before the first result arrives", async () => {
    let release: (response: Response) => void = () => {};
    mockApi({ places: () => new Promise<Response>((resolve) => (release = resolve)) });
    render(<Explorer config={config} debounceMs={0} />);

    expect(screen.getByRole("status")).toHaveTextContent("Waiting for the map");
    act(() => stubState.emitBounds(boston));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Loading places"));

    await act(async () =>
      release(jsonResponse({ items: [alpha], total: 1, limit: 500, offset: 0 })),
    );
    expect(await screen.findAllByTestId("marker")).toHaveLength(1);
  });

  it("explains an empty area and recovers when the map returns", async () => {
    mockApi();
    await openMap();
    await screen.findAllByTestId("marker");

    act(() => stubState.emitBounds(paris));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No places in this area"));
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
    expect(screen.getByTestId("google-map")).toBeInTheDocument();

    act(() => stubState.emitBounds(boston));
    expect(await screen.findAllByTestId("marker")).toHaveLength(2);
  });

  it("uses singular wording for one place", async () => {
    mockApi({ places: () => jsonResponse({ items: [alpha], total: 1, limit: 500, offset: 0 }) });

    await openMap();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 place in view"));
  });
});

describe("Explorer selection", () => {
  it("shows a preview of the clicked marker", async () => {
    mockApi();
    const user = await openMap();

    await user.click(await screen.findByRole("button", { name: "Beta Hall" }));

    const preview = within(panel());
    expect(preview.getByRole("heading", { name: "Beta Hall" })).toBeInTheDocument();
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
    const list = await within(panel()).findByRole("list");

    within(list).getByRole("button", { name: /Beta Hall/ }).focus();
    await user.keyboard("{Enter}");

    expect(within(panel()).getByRole("heading", { name: "Beta Hall" })).toBeInTheDocument();
  });

  it("clears the selection from the close button and from the empty map", async () => {
    mockApi();
    const user = await openMap();

    await user.click(await screen.findByRole("button", { name: "Alpha House" }));
    await user.click(screen.getByRole("button", { name: /Close/ }));
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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No places"));

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
    expect(details.getByText("Dome")).toBeInTheDocument();
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
    expect(screen.getByText(/our own estimates, not information from the venue/)).toBeInTheDocument();
  });

  it("lists sources with what they support", async () => {
    await openDetails();

    const link = await screen.findByRole("link", { name: "Example reference" });
    expect(link).toHaveAttribute("href", "https://example.org/reference");
    expect(screen.getByText(/Supports: construction date, architects/)).toBeInTheDocument();
  });

  it("does not show raw field names or internal scores", async () => {
    await openDetails();
    await screen.findByText("A fictional house used in tests.");

    const text = panel().textContent ?? "";
    for (const raw of ["year_built", "field_sources", "significance_score", "official_site", "null"]) {
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

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The details could not be loaded.");
    expect(screen.getAllByTestId("marker")).toHaveLength(2);

    healthy = true;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("A fictional house used in tests.")).toBeInTheDocument();
  });

  it("explains a place that no longer exists", async () => {
    await openDetails({ detail: () => jsonResponse({ detail: "Place not found" }, 404) });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This place is no longer available.");
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains malformed details", async () => {
    await openDetails({ detail: () => jsonResponse({ slug: "alpha-house" }) });

    expect(await screen.findByRole("alert")).toHaveTextContent("The details could not be loaded.");
  });

  it("works for a place with almost no information", async () => {
    await openDetails({
      detail: () =>
        jsonResponse(
          makeDetail({
            address_line: null,
            year_built_start: null,
            year_built_end: null,
            building_type: null,
            period: null,
            architects: [],
            styles: [],
            tags: [],
            description: null,
            significance_text: null,
            admission_notes: null,
            reservation_required: null,
            tours_available: null,
            accessibility: null,
            website_url: null,
            opening_hours: [],
            curated: {
              significance_score: null,
              visit_minutes_exterior: null,
              visit_minutes_interior: null,
            },
            field_sources: [],
          }),
        ),
    });

    expect(await screen.findByText("Visiting")).toBeInTheDocument();
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
    expect(screen.queryByText("Estimated visit time")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not confirmed")).toHaveLength(2);
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

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Places could not be loaded.");
    expect(alert).toHaveTextContent("It may not be running.");
    expect(screen.getByTestId("google-map")).toBeInTheDocument();
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
    const alert = await screen.findByRole("alert");

    online = true;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findAllByTestId("marker")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a response it cannot read", async () => {
    mockApi({ places: () => jsonResponse({ unexpected: true }) });

    await openMap();

    expect(await screen.findByRole("alert")).toHaveTextContent("a response we could not read");
  });
});

describe("Explorer without a Google Maps key", () => {
  it("shows setup help and still loads nothing it cannot display", () => {
    const fetchMock = mockApi();

    render(<Explorer config={{ apiKey: null, mapId: "test-map" }} debounceMs={0} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Google Maps is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
