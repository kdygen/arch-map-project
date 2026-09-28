import { useCallback, useRef, useState } from "react";

import { ApiError, isAbortError } from "@/lib/api/client";
import { computeRoute } from "@/lib/api/routes";
import {
  DEFAULT_TRAVEL_MODE,
  type Endpoint,
  type Route,
  routeKey,
  type TravelMode,
} from "@/lib/routing/types";

export type RouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; route: Route }
  | { status: "error"; error: ApiError };

export type RouteController = {
  state: RouteState;
  /** Request a route. This is the only thing that causes a paid request. */
  find: (origin: Endpoint, destination: Endpoint, mode?: TravelMode) => void;
  clear: () => void;
};

/**
 * Owns the active route. A request is only ever sent from `find`, and never
 * when one is already running or when the same route is already shown.
 */
export function useRoute(): RouteController {
  const [state, setState] = useState<RouteState>({ status: "idle" });
  const inFlight = useRef<{ key: string; controller: AbortController } | null>(null);
  const activeKey = useRef<string | null>(null);

  const find = useCallback(
    (origin: Endpoint, destination: Endpoint, mode: TravelMode = DEFAULT_TRAVEL_MODE) => {
      const key = routeKey(origin, destination, mode);
      if (inFlight.current !== null) return;
      if (activeKey.current === key) return;

      const controller = new AbortController();
      inFlight.current = { key, controller };
      setState({ status: "loading" });

      computeRoute(origin, destination, mode, controller.signal)
        .then((route) => {
          activeKey.current = key;
          setState({ status: "ready", route });
        })
        .catch((error: unknown) => {
          if (isAbortError(error) || controller.signal.aborted) return;
          activeKey.current = null;
          setState({
            status: "error",
            error:
              error instanceof ApiError
                ? error
                : new ApiError("network", "Could not calculate the route"),
          });
        })
        .finally(() => {
          if (inFlight.current?.controller === controller) inFlight.current = null;
        });
    },
    [],
  );

  const clear = useCallback(() => {
    inFlight.current?.controller.abort();
    inFlight.current = null;
    activeKey.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, find, clear };
}
