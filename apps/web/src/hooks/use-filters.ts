import { useEffect, useMemo, useReducer } from "react";

import {
  type FilterAction,
  type FilterState,
  filterKey,
  filterReducer,
  toApiParams,
} from "@/lib/filters/state";
import { serializeFilters } from "@/lib/filters/url";

import type { ViewportFilters } from "./use-viewport-places";
import { useDebouncedValue } from "./use-debounced-value";

export type Filters = {
  /** What the controls show. Changes on every keystroke. */
  state: FilterState;
  dispatch: (action: FilterAction) => void;
  /** What is actually applied, after typing has paused. */
  applied: FilterState;
  viewport: ViewportFilters;
};

/**
 * Central filter state. The applied filters are debounced so typing in the
 * search box or a year field does not send a request per keystroke. The
 * applied filters are mirrored into the page address so a view can be shared.
 */
export function useFilters(initial: FilterState, debounceMs: number, syncUrl = true): Filters {
  const [state, dispatch] = useReducer(filterReducer, initial);
  const applied = useDebouncedValue(state, debounceMs);

  const key = filterKey(applied);
  const viewport = useMemo<ViewportFilters>(
    () => ({ params: toApiParams(applied), key }),
    // `key` fully describes the applied parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const query = serializeFilters(applied);
  useEffect(() => {
    if (!syncUrl) return;
    const current = window.location.search.replace(/^\?/, "");
    if (current === query) return;
    // replaceState, so filter changes do not flood the back button.
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [query, syncUrl]);

  return { state, dispatch, applied, viewport };
}
