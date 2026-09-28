import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, isAbortError } from "@/lib/api/client";
import { listPlacesInBounds, type PlaceSummary } from "@/lib/api/places";
import { type Bounds, isValidBounds, normalizeBounds, toBboxParam } from "@/lib/geo/bounds";
import { type Coverage, isCovered, placesInViewport } from "@/lib/geo/viewport";

import { useDebouncedValue } from "./use-debounced-value";

export type ViewportStatus = "waiting" | "loading" | "ready" | "error";

export type ViewportPlaces = {
  status: ViewportStatus;
  /** Places inside the current viewport. Kept during a reload to avoid flicker. */
  places: PlaceSummary[];
  /** True when the viewport holds more places than one request returns. */
  truncated: boolean;
  error: ApiError | null;
  retry: () => void;
};

type Failure = { key: string; attempt: number; error: ApiError };

/**
 * Loads the places inside the visible map area.
 *
 * - Waits until the map has stopped moving for `debounceMs`.
 * - Skips the request when an earlier complete result already covers the area.
 * - Cancels a request that is still running when the viewport changes again.
 */
export function useViewportPlaces(bounds: Bounds | null, debounceMs: number): ViewportPlaces {
  const requested = useMemo(
    () => (bounds && isValidBounds(bounds) ? normalizeBounds(bounds) : null),
    [bounds],
  );
  const requestedKey = requested ? toBboxParam(requested) : null;
  // Debounce the key, a string, so equal viewports never restart the timer.
  const key = useDebouncedValue(requestedKey, debounceMs);

  const [coverage, setCoverage] = useState<(Coverage & { key: string }) | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);

  const viewport = useMemo<Bounds | null>(() => {
    if (key === null) return null;
    const [west, south, east, north] = key.split(",").map(Number);
    return { west, south, east, north };
  }, [key]);

  const covered =
    viewport !== null && (coverage?.key === key || isCovered(coverage, viewport));

  useEffect(() => {
    if (viewport === null || key === null || covered) return;

    const controller = new AbortController();
    listPlacesInBounds(viewport, controller.signal)
      .then((list) => {
        setCoverage({
          key,
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
  }, [viewport, key, covered, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

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
    places,
    truncated: covered && coverage !== null && !coverage.complete,
    error: status === "error" ? (activeFailure?.error ?? null) : null,
    retry,
  };
}
