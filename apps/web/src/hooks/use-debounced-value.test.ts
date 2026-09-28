import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with the first value", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 300));

    expect(result.current).toBe("a");
  });

  it("changes only after the value has been stable for the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: "a" },
    });

    rerender({ v: "b" });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe("b");
  });

  it("skips the values in between during rapid changes", () => {
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ v }) => {
        const value = useDebouncedValue(v, 300);
        if (seen.at(-1) !== value) seen.push(value);
        return value;
      },
      { initialProps: { v: "a" } },
    );

    for (const v of ["b", "c", "d"]) {
      rerender({ v });
      act(() => void vi.advanceTimersByTime(100));
    }
    act(() => void vi.advanceTimersByTime(300));

    expect(seen).toEqual(["a", "d"]);
  });
});
