import { useCallback, useEffect, useState } from "react";

import { ApiError, isAbortError } from "@/lib/api/client";
import { type FilterOptions, getFilterOptions } from "@/lib/api/filters";

export type FilterOptionsState =
  | { status: "loading" }
  | { status: "ready"; options: FilterOptions }
  | { status: "error"; error: ApiError; retry: () => void };

type Result = { attempt: number; options: FilterOptions } | { attempt: number; error: ApiError };

/** The filter choices the catalog currently offers, loaded once. */
export function useFilterOptions(): FilterOptionsState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getFilterOptions(controller.signal)
      .then((options) => setResult({ attempt, options }))
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setResult({
          attempt,
          error:
            error instanceof ApiError ? error : new ApiError("network", "Could not load filters"),
        });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (result !== null && "options" in result) return { status: "ready", options: result.options };
  if (result !== null && result.attempt === attempt && "error" in result) {
    return { status: "error", error: result.error, retry };
  }
  return { status: "loading" };
}
