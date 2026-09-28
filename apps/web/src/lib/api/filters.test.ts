import { describe, expect, it, vi } from "vitest";

import { jsonResponse } from "@/test/fixtures";
import { makeFilterOptions } from "@/test/fixtures-filters";

import { getFilterOptions } from "./filters";

describe("getFilterOptions", () => {
  it("requests and validates the filter options", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return jsonResponse(makeFilterOptions());
    });
    vi.stubGlobal("fetch", fetchMock);

    const options = await getFilterOptions();

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/v1/filters");
    expect(options.styles.map((s) => s.slug)).toEqual(["classical", "modernism"]);
  });

  it("rejects an unexpected shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ styles: "all" })),
    );

    await expect(getFilterOptions()).rejects.toMatchObject({ kind: "malformed" });
  });
});
