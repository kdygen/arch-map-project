import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, isAbortError } from "@/lib/api/client";
import { listPlacesInBounds, type PlaceSummary } from "@/lib/api/places";
import type { ApiFilterParams } from "@/lib/filters/state";
import { type Bounds, isValidBounds, normalizeBounds, toBboxParam } from "@/lib/geo/bounds";
import { type Coverage, isCovered, placesInViewport } from "@/lib/geo/viewport";

import { useDebouncedValue } from "./use-debounced-value";

export type ViewportStatus = "waiting" | "loading" | "ready" | "error";

export type ViewportPlaces = {
  status: ViewportStatus;
  /** Matching places inside the current viewport. Kept during a reload to avoid flicker. */
  places: PlaceSummary[];
  /** True when the viewport holds more places than one request returns. */
  truncated: boolean;
  error: ApiError | null;
  retry: () => void;
};

export type ViewportFilters = {
  params: ApiFilterParams;
  /** Changes exactly when `params` changes. See filterKey(). */
  key: string;
};

const NO_FILTERS: ViewportFilters = { params: {}, key: "" };

type Failure = { key: string; attempt: number; error: ApiError };

/**
 * Loads the places inside the visible map area that match the filters.
 *
 * - Waits until the map has stopped moving for `debounceMs`. Filter changes
 *   apply at once, because callers debounce typed input themselves.
 * - Skips the request when an earlier complete result with the same filters
 *   already covers the area.
 * - Cancels a request that is still running when anything changes again.
 */
export function useViewportPlaces(
  bounds: Bounds | null,
  debounceMs: number,
  filters: ViewportFilters = NO_FILTERS,
): ViewportPlaces {
  const requested = useMemo(
    () => (bounds && isValidBounds(bounds) ? normalizeBounds(bounds) : null),
    [bounds],
  );
  // Debounce the bbox string, so equal viewports never restart the timer.
  const bboxKey = useDebouncedValue(requested ? toBboxParam(requested) : null, debounceMs);
  const key = bboxKey === null ? null : `${bboxKey}|${filters.key}`;

  const [coverage, setCoverage] = useState<(Coverage & { key: string }) | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);

  const viewport = useMemo<Bounds | null>(() => {
    if (bboxKey === null) return null;
    const [west, south, east, north] = bboxKey.split(",").map(Number);
    return { west, south, east, north };
  }, [bboxKey]);

  const covered =
    viewport !== null && (coverage?.key === key || isCovered(coverage, viewport, filters.key));

  // Read through a ref-like memo so the effect only restarts when the key does.
  const params = filters.params;
  const filterKey = filters.key;

  useEffect(() => {
    if (viewport === null || key === null || covered) return;

    const controller = new AbortController();
    listPlacesInBounds(viewport, params, controller.signal)
      .then((list) => {
        setCoverage({
          key,
          filterKey,
          bounds: viewport,
          places: list.items,
          complete: list.total <= list.items.length,
        });
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        const apiError =
          error instanceof ApiError ? error : new ApiError("network", "Could not load places");
        setFailure({ key, attempt, error: apiError });
      });

    return () => controller.abort();
    // `params` is fully described by `filterKey`, which is part of `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, key, covered, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // While new filters load, keep showing the previous places to avoid flicker.
  const places = useMemo(
    () => (coverage && viewport ? placesInViewport(coverage.places, viewport) : []),
    [coverage, viewport],
  );

  const activeFailure =
    failure !== null && failure.key === key && failure.attempt === attempt ? failure : null;

  let status: ViewportStatus;
  if (viewport === null) status = "waiting";
  else if (covered) status = "ready";
  else if (activeFailure) status = "error";
  else status = "loading";

  return {
    status,
    places: status === "error" ? [] : places,
    truncated: covered && coverage !== null && !coverage.complete,
    error: status === "error" ? (activeFailure?.error ?? null) : null,
    retry,
  };
}
