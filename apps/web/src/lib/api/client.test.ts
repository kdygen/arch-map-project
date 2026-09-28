import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { jsonResponse } from "@/test/fixtures";

import { apiGet, ApiError, buildUrl } from "./client";

const schema = z.object({ value: z.number() });

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("buildUrl", () => {
  it("targets the versioned API", () => {
    expect(buildUrl("/places")).toBe("http://localhost:8000/api/v1/places");
  });

  it("encodes parameters, repeats lists, and skips empty values", () => {
    const url = buildUrl("/places", {
      bbox: "-71.12,42.34,-71.05,42.37",
      limit: 500,
      tag: ["dome", "brick"],
      style: undefined,
      period: null,
      architect: "",
    });

    expect(url).toBe(
      "http://localhost:8000/api/v1/places?bbox=-71.12%2C42.34%2C-71.05%2C42.37&limit=500&tag=dome&tag=brick",
    );
  });
});

describe("apiGet", () => {
  it("returns the validated body", async () => {
    mockFetch(async () => jsonResponse({ value: 1, extra: "ignored" }));

    await expect(apiGet("/x", { schema })).resolves.toEqual({ value: 1 });
  });

  it("reports an unreachable API as a network error", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const error = await failure(apiGet("/x", { schema }));

    expect(error.kind).toBe("network");
  });

  it.each([404, 422, 500, 503])("reports status %i as an http error", async (status) => {
    mockFetch(async () => jsonResponse({ detail: "nope" }, status));

    const error = await failure(apiGet("/x", { schema }));

    expect(error.kind).toBe("http");
    expect(error.status).toBe(status);
  });

  it("reports a body that is not JSON as malformed", async () => {
    mockFetch(async () => new Response("<html>gateway</html>", { status: 200 }));

    const error = await failure(apiGet("/x", { schema }));

    expect(error.kind).toBe("malformed");
  });

  it("reports an unexpected shape as malformed", async () => {
    mockFetch(async () => jsonResponse({ value: "one" }));

    const error = await failure(apiGet("/x", { schema }));

    expect(error.kind).toBe("malformed");
  });

  it("lets a cancelled request surface as an abort, not an API error", async () => {
    mockFetch(async () => {
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(apiGet("/x", { schema })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes the abort signal to fetch", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ value: 1 }));
    const controller = new AbortController();

    await apiGet("/x", { schema, signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/x",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
