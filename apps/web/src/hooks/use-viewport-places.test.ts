import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bounds } from "@/lib/geo/bounds";
import { jsonResponse, makeSummary } from "@/test/fixtures";

import { useViewportPlaces } from "./use-viewport-places";

const DEBOUNCE = 300;
const boston: Bounds = { west: -71.12, south: 42.34, east: -71.05, north: 42.37 };
const zoomedIn: Bounds = { west: -71.07, south: 42.355, east: -71.055, north: 42.365 };
const paris: Bounds = { west: 2.2, south: 48.8, east: 2.4, north: 48.9 };

const inside = makeSummary({ slug: "inside", latitude: 42.36, longitude: -71.06 });
const edge = makeSummary({ slug: "edge", latitude: 42.36, longitude: -71.1 });

type Responder = (bbox: string) => Response | Promise<Response>;

function mockApi(responder: Responder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const bbox = new URL(url).searchParams.get("bbox") ?? "";
    const response = await responder(bbox);
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const list = (items: unknown[], total = items.length) =>
  jsonResponse({ items, total, limit: 500, offset: 0 });

const requestedBoxes = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get("bbox"));

async function settle(ms = DEBOUNCE) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function render(initial: Bounds | null = null) {
  return renderHook(({ bounds }) => useViewportPlaces(bounds, DEBOUNCE), {
    initialProps: { bounds: initial },
  });
}

describe("useViewportPlaces", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits and requests nothing until the map reports its bounds", async () => {
    const fetchMock = mockApi(() => list([]));

    const { result } = render(null);
    await settle();

    expect(result.current.status).toBe("waiting");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the places for the viewport", async () => {
    const fetchMock = mockApi(() => list([inside, edge]));

    const { result } = render(boston);
    expect(result.current.status).toBe("loading");
    await settle(0);

    expect(result.current.status).toBe("ready");
    expect(result.current.places.map((p) => p.slug)).toEqual(["inside", "edge"]);
    expect(requestedBoxes(fetchMock)).toEqual(["-71.12,42.34,-71.05,42.37"]);
  });

  it("sends one request after the map stops moving, not one per movement", async () => {
    const fetchMock = mockApi(() => list([]));
    const { rerender } = render(boston);
    await settle(0);
    fetchMock.mockClear();

    for (let step = 1; step <= 10; step++) {
      rerender({ bounds: { ...boston, west: boston.west - step, east: boston.east - step } });
      await settle(50);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    await settle();

    expect(requestedBoxes(fetchMock)).toEqual(["-81.12,42.34,-81.05,42.37"]);
  });

  it("does not request again for the same viewport", async () => {
    const fetchMock = mockApi(() => list([inside]));
    const { rerender } = render(boston);
    await settle(0);

    rerender({ bounds: { ...boston } });
    rerender({ bounds: { ...boston, west: boston.west + 0.000001 } });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the loaded places when zooming in, without a request", async () => {
    const fetchMock = mockApi(() => list([inside, edge]));
    const { result, rerender } = render(boston);
    await settle(0);

    rerender({ bounds: zoomedIn });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
    expect(result.current.places.map((p) => p.slug)).toEqual(["inside"]);
  });

  it("requests again when zooming in on a result that was cut off", async () => {
    const fetchMock = mockApi(() => list([inside], 900));
    const { result, rerender } = render(boston);
    await settle(0);
    expect(result.current.truncated).toBe(true);

    rerender({ bounds: zoomedIn });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows an empty area as ready with no places, then reloads on return", async () => {
    const fetchMock = mockApi((bbox) => list(bbox.startsWith("2.2") ? [] : [inside]));
    const { result, rerender } = render(boston);
    await settle(0);

    rerender({ bounds: paris });
    await settle();
    expect(result.current.status).toBe("ready");
    expect(result.current.places).toEqual([]);
    expect(result.current.error).toBeNull();

    rerender({ bounds: boston });
    await settle();
    expect(result.current.places.map((p) => p.slug)).toEqual(["inside"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ignores a slow response for a viewport the user already left", async () => {
    let releaseBoston: (response: Response) => void = () => {};
    mockApi((bbox) =>
      bbox.startsWith("2.2")
        ? list([])
        : new Promise<Response>((resolve) => {
            releaseBoston = resolve;
          }),
    );
    const { result, rerender } = render(boston);
    await settle(0);

    rerender({ bounds: paris });
    await settle();
    await act(async () => releaseBoston(list([inside])));

    expect(result.current.status).toBe("ready");
    expect(result.current.places).toEqual([]);
  });

  it("reports an unreachable API and recovers on retry", async () => {
    let online = false;
    mockApi(() => {
      if (!online) throw new TypeError("Failed to fetch");
      return list([inside]);
    });
    const { result } = render(boston);
    await settle(0);

    expect(result.current.status).toBe("error");
    expect(result.current.error?.kind).toBe("network");
    expect(result.current.places).toEqual([]);

    online = true;
    act(() => result.current.retry());
    await settle(0);

    expect(result.current.status).toBe("ready");
    expect(result.current.places).toHaveLength(1);
  });

  it("reports a malformed response as an error", async () => {
    mockApi(() => jsonResponse({ items: [{ slug: "broken" }], total: 1, limit: 1, offset: 0 }));

    const { result } = render(boston);
    await settle(0);

    expect(result.current.status).toBe("error");
    expect(result.current.error?.kind).toBe("malformed");
  });

  it("ignores bounds that are not valid numbers", async () => {
    const fetchMock = mockApi(() => list([]));

    const { result } = render({ ...boston, west: Number.NaN });
    await settle();

    expect(result.current.status).toBe("waiting");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
