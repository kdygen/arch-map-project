import { useCallback, useEffect, useState } from "react";

import { ApiError, isAbortError } from "@/lib/api/client";
import { getPlace, type PlaceDetail } from "@/lib/api/places";

export type PlaceDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; place: PlaceDetail }
  | { status: "error"; error: ApiError; retry: () => void };

type Loaded = { slug: string; place: PlaceDetail };
type Failure = { slug: string; attempt: number; error: ApiError };

/** Loads full details for one place. Pass null when no details are wanted. */
export function usePlaceDetail(slug: string | null): PlaceDetailState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);

  const isLoaded = slug !== null && loaded?.slug === slug;

  useEffect(() => {
    if (slug === null || isLoaded) return;

    const controller = new AbortController();
    getPlace(slug, controller.signal)
      .then((place) => {
        setLoaded({ slug, place });
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        const apiError =
          error instanceof ApiError ? error : new ApiError("network", "Could not load place");
        setFailure({ slug, attempt, error: apiError });
      });

    return () => controller.abort();
  }, [slug, isLoaded, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (slug === null) return { status: "idle" };
  if (isLoaded) return { status: "ready", place: loaded.place };
  if (failure !== null && failure.slug === slug && failure.attempt === attempt) {
    return { status: "error", error: failure.error, retry };
  }
  return { status: "loading" };
}
