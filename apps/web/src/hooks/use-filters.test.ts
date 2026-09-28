import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_FILTERS } from "@/lib/filters/state";

import { useFilters } from "./use-filters";

describe("useFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("shows typed text at once but applies it after the pause", () => {
    const { result } = renderHook(() => useFilters(EMPTY_FILTERS, 300));

    act(() => result.current.dispatch({ type: "setQuery", q: "trin" }));
    expect(result.current.state.q).toBe("trin");
    expect(result.current.viewport.params.q).toBeUndefined();

    act(() => void vi.advanceTimersByTime(300));
    expect(result.current.viewport.params.q).toBe("trin");
  });

  it("keeps the same viewport filters object while nothing applied changes", () => {
    const { result, rerender } = renderHook(() => useFilters(EMPTY_FILTERS, 0));
    act(() => void vi.advanceTimersByTime(0));
    const first = result.current.viewport;

    rerender();
    act(() => result.current.dispatch({ type: "setQuery", q: "   " }));
    act(() => void vi.advanceTimersByTime(0));

    expect(result.current.viewport).toBe(first);
  });

  it("writes the applied filters to the page address without adding history", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useFilters(EMPTY_FILTERS, 0));

    act(() => result.current.dispatch({ type: "toggle", group: "style", value: "modernism" }));
    act(() => result.current.dispatch({ type: "setQuery", q: "mit" }));
    act(() => void vi.advanceTimersByTime(0));

    expect(window.location.search).toBe("?q=mit&style=modernism");
    expect(pushState).not.toHaveBeenCalled();

    act(() => result.current.dispatch({ type: "clearAll" }));
    act(() => void vi.advanceTimersByTime(0));
    expect(window.location.search).toBe("");
  });

  it("does not touch the address when syncing is off", () => {
    const { result } = renderHook(() => useFilters(EMPTY_FILTERS, 0, false));

    act(() => result.current.dispatch({ type: "setQuery", q: "mit" }));
    act(() => void vi.advanceTimersByTime(0));

    expect(window.location.search).toBe("");
  });
});
