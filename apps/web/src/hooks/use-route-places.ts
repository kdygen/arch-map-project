import { useCallback, useEffect, useState } from "react";

import { ApiError, isAbortError } from "@/lib/api/client";
import { listPlacesNearRoute, type RoutePlaces } from "@/lib/api/routes";

import type { ViewportFilters } from "./use-viewport-places";

export type RoutePlacesState =
  | { status: "idle" }
  | { status: "loading"; previous: RoutePlaces | null }
  | { status: "ready"; result: RoutePlaces }
  | { status: "error"; error: ApiError; retry: () => void };

type Loaded = { key: string; result: RoutePlaces };
type Failure = { key: string; attempt: number; error: ApiError };

/**
 * Architecture near the route line, from our own database. Changing the
 * filters asks our backend again. It never asks for a new route.
 */
export function useRoutePlaces(
  polyline: string | null,
  filters: ViewportFilters,
): RoutePlacesState {
  const key = polyline === null ? null : `${polyline}|${filters.key}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);

  const isLoaded = key !== null && loaded?.key === key;
  const params = filters.params;

  useEffect(() => {
    if (polyline === null || key === null || isLoaded) return;

    const controller = new AbortController();
    listPlacesNearRoute(polyline, params, controller.signal)
      .then((result) => {
        setLoaded({ key, result });
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setFailure({
          key,
          attempt,
          error:
            error instanceof ApiError ? error : new ApiError("network", "Could not load places"),
        });
      });

    return () => controller.abort();
    // `params` is fully described by `filters.key`, which is part of `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyline, key, isLoaded, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (key === null) return { status: "idle" };
  if (isLoaded) return { status: "ready", result: loaded.result };
  if (failure !== null && failure.key === key && failure.attempt === attempt) {
    return { status: "error", error: failure.error, retry };
  }
  // Keep the last list for the same route while new filters load.
  const sameRoute = loaded !== null && loaded.key.startsWith(`${polyline}|`);
  return { status: "loading", previous: sameRoute ? loaded.result : null };
}
