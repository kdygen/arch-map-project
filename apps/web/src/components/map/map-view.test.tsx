import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fitBounds, providerMounts, stubState } from "@/test/google-maps-stub";
import { makeSummary } from "@/test/fixtures";

import { MapView, type MapViewProps } from "./map-view";
import { MapsProvider } from "./maps-provider";

vi.mock("@vis.gl/react-google-maps", () => import("@/test/google-maps-stub"));

const places = [
  makeSummary({ slug: "alpha", name: "Alpha House", latitude: 42.36, longitude: -71.06 }),
  makeSummary({ slug: "beta", name: "Beta Hall", latitude: 42.35, longitude: -71.09 }),
];

function setup(overrides: Partial<MapViewProps> = {}) {
  const props: MapViewProps = {
    config: { apiKey: "test-key", mapId: "test-map" },
    places,
    selectedSlug: null,
    onSelect: vi.fn(),
    onBoundsChange: vi.fn(),
    ...overrides,
  };
  const view = render(
    <MapsProvider config={props.config}>
      <MapView {...props} />
    </MapsProvider>,
  );
  return { ...view, props };
}

beforeEach(() => {
  providerMounts.mockClear();
});

describe("MapView without an API key", () => {
  it("explains how to configure the key instead of crashing", () => {
    setup({ config: { apiKey: null, mapId: "test-map" } });

    expect(screen.getByRole("alert")).toHaveTextContent("Google Maps is not configured");
    expect(screen.getByRole("alert")).toHaveTextContent("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY");
    expect(screen.getByRole("alert")).toHaveTextContent("apps/web/.env.local");
  });

  it("never tries to load Google Maps", () => {
    setup({ config: { apiKey: null, mapId: "test-map" } });

    expect(providerMounts).not.toHaveBeenCalled();
    expect(screen.queryByTestId("google-map")).not.toBeInTheDocument();
  });
});

describe("MapView with an API key", () => {
  it("renders one marker per place at its coordinates", () => {
    setup();

    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute("data-lat", "42.36");
    expect(markers[0]).toHaveAttribute("data-lng", "-71.06");
    expect(screen.getByRole("button", { name: "Alpha House" })).toBeInTheDocument();
  });

  it("renders no markers for an empty area and still shows the map", () => {
    setup({ places: [] });

    expect(screen.getByTestId("google-map")).toBeInTheDocument();
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
  });

  it("passes the configured map ID to the map", () => {
    setup();

    expect(screen.getByTestId("google-map")).toHaveAttribute("data-map-id", "test-map");
  });

  it("reports the clicked place", async () => {
    const { props } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Beta Hall" }));

    expect(props.onSelect).toHaveBeenCalledWith("beta");
  });

  it("marks the selected place in text, not only by appearance", () => {
    setup({ selectedSlug: "alpha" });

    const marker = screen.getByRole("button", { name: "Alpha House, selected" });
    expect(marker).toHaveTextContent("Alpha House");
    expect(screen.getByRole("button", { name: "Beta Hall" })).toHaveTextContent("");
  });

  it("clears the selection when the empty map is clicked", async () => {
    const { props } = setup({ selectedSlug: "alpha" });

    await userEvent.click(screen.getByRole("button", { name: "empty map area" }));

    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("reports the visible bounds as a plain object", () => {
    const { props } = setup();

    act(() => stubState.emitBounds({ west: -71.12, south: 42.34, east: -71.05, north: 42.37 }));

    expect(props.onBoundsChange).toHaveBeenCalledWith({
      west: -71.12,
      south: 42.34,
      east: -71.05,
      north: 42.37,
    });
  });

  it("does not remount the Maps loader when places or selection change", () => {
    const { rerender, props } = setup();

    rerender(
      <MapsProvider config={props.config}>
        <MapView {...props} places={[places[0]]} selectedSlug="alpha" />
      </MapsProvider>,
    );

    const keys = providerMounts.mock.calls.map(([key]) => key);
    expect(new Set(keys)).toEqual(new Set(["test-key"]));
    expect(screen.getAllByTestId("api-provider")).toHaveLength(1);
  });
});

describe("MapView when Google Maps fails", () => {
  it("explains a rejected key", () => {
    setup();

    act(() => window.gm_authFailure?.());

    expect(screen.getByRole("alert")).toHaveTextContent("Google Maps rejected the API key");
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP referrer");
  });

  it("explains a script that could not be loaded", () => {
    setup();

    act(() => stubState.failToLoad());

    expect(screen.getByRole("alert")).toHaveTextContent("Google Maps could not be loaded");
  });

  it("never shows the key in an error message", () => {
    setup({ config: { apiKey: "super-secret-key", mapId: "test-map" } });

    act(() => window.gm_authFailure?.());

    expect(document.body).not.toHaveTextContent("super-secret-key");
  });
});

describe("MapView with a route", () => {
  const route = {
    polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
    distanceMeters: 3000,
    durationSeconds: 2400,
    travelMode: "walking" as const,
    warnings: [],
    origin: { label: "MIT", lat: 38.5, lng: -120.2 },
    destination: { label: "Boston Common", lat: 43.252, lng: -126.453 },
  };

  it("draws the decoded route line", () => {
    setup({ route });

    const lines = screen.getAllByTestId("route-line");
    expect(lines[0]).toHaveAttribute("data-points", "3");
    expect(lines[0]).toHaveAttribute("data-first", "38.5,-120.2");
    expect(lines[0]).toHaveAttribute("data-last", "43.252,-126.453");
  });

  it("labels the origin and destination in words", () => {
    setup({ route });

    expect(screen.getByRole("img", { name: "Origin: MIT" })).toHaveTextContent("A");
    expect(screen.getByRole("img", { name: "Destination: Boston Common" })).toHaveTextContent("B");
  });

  it("keeps architecture markers visible and selectable", async () => {
    const { props } = setup({ route, selectedSlug: "alpha" });

    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Beta Hall" }));

    expect(props.onSelect).toHaveBeenCalledWith("beta");
  });

  it("fits the map to the whole route", () => {
    fitBounds.mockClear();

    setup({ route });

    expect(fitBounds).toHaveBeenCalledWith(
      { west: -126.453, south: 38.5, east: -120.2, north: 43.252 },
      64,
    );
  });

  it("draws nothing extra without a route", () => {
    setup();

    expect(screen.queryByTestId("route-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("endpoint-marker")).not.toBeInTheDocument();
  });
});
