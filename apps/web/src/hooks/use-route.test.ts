import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { jsonResponse } from "@/test/fixtures";

import { useRoute } from "./use-route";

const mit = { label: "MIT", lat: 42.3601, lng: -71.0942 };
const common = { label: "Boston Common", lat: 42.355, lng: -71.0655 };
const body = {
  route: {
    polyline: "abc",
    distance_meters: 1,
    duration_seconds: 1,
    travel_mode: "walking",
    warnings: [],
  },
};

function mockApi(respond: () => Response | Promise<Response> = () => jsonResponse(body)) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    void url;
    const response = await respond();
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useRoute", () => {
  it("requests nothing until asked", () => {
    const fetchMock = mockApi();

    const { result } = renderHook(() => useRoute());

    expect(result.current.state.status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads a route", async () => {
    mockApi();
    const { result } = renderHook(() => useRoute());

    act(() => result.current.find(mit, common));
    expect(result.current.state.status).toBe("loading");

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state).toMatchObject({ route: { origin: mit, destination: common } });
  });

  it("ignores further requests while one is running", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = mockApi(() => new Promise<Response>((resolve) => (release = resolve)));
    const { result } = renderHook(() => useRoute());

    act(() => {
      result.current.find(mit, common);
      result.current.find(mit, common);
      result.current.find(common, mit);
    });
    await act(async () => release(jsonResponse(body)));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not request the route that is already shown", async () => {
    const fetchMock = mockApi();
    const { result } = renderHook(() => useRoute());
    act(() => result.current.find(mit, common));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => result.current.find({ ...mit }, { ...common }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("ready");
  });

  it("requests again when the endpoints are swapped", async () => {
    const fetchMock = mockApi();
    const { result } = renderHook(() => useRoute());
    act(() => result.current.find(mit, common));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => result.current.find(common, mit));
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "ready", route: { origin: common } }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requests again for the same places in another travel mode", async () => {
    const fetchMock = mockApi();
    const { result } = renderHook(() => useRoute());
    act(() => result.current.find(mit, common, "walking"));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => result.current.find(mit, common, "driving"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const modes = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init!.body as string).travel_mode,
    );
    expect(modes).toEqual(["walking", "driving"]);
  });

  it("reports a failure and allows another try", async () => {
    let healthy = false;
    const fetchMock = mockApi(() =>
      healthy ? jsonResponse(body) : jsonResponse({ detail: "busy", code: "routing_timeout" }, 504),
    );
    const { result } = renderHook(() => useRoute());

    act(() => result.current.find(mit, common));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state).toMatchObject({ error: { code: "routing_timeout" } });

    healthy = true;
    act(() => result.current.find(mit, common));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears the route and cancels a running request", async () => {
    let release: (r: Response) => void = () => {};
    mockApi(() => new Promise<Response>((resolve) => (release = resolve)));
    const { result } = renderHook(() => useRoute());
    act(() => result.current.find(mit, common));

    act(() => result.current.clear());
    await act(async () => release(jsonResponse(body)));

    expect(result.current.state.status).toBe("idle");
  });

  it("can request the same route again after clearing", async () => {
    const fetchMock = mockApi();
    const { result } = renderHook(() => useRoute());
    act(() => result.current.find(mit, common));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => result.current.clear());
    act(() => result.current.find(mit, common));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
