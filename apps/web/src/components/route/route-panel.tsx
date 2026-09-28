"use client";

import type { RouteController } from "@/hooks/use-route";
import type { ApiError } from "@/lib/api/client";
import { formatRouteDistance, formatRouteDuration } from "@/lib/format/route";
import type { PlaceAutocomplete } from "@/lib/routing/autocomplete";
import { TRAVEL_MODE_LABELS, TRAVEL_MODES, type TravelMode } from "@/lib/routing/types";
import { type PlannerAction, plannerProblem, type PlannerState } from "@/lib/routing/planner-state";

import { EndpointInput } from "./endpoint-input";
import styles from "./route.module.css";

type Props = {
  planner: PlannerState;
  dispatch: (action: PlannerAction) => void;
  route: RouteController;
  autocomplete: PlaceAutocomplete;
  suggestionDebounceMs?: number;
};

const MODE_ICONS: Record<TravelMode, string> = { walking: "🚶", driving: "🚗" };

function modeWord(mode: TravelMode): string {
  return TRAVEL_MODE_LABELS[mode].toLowerCase();
}

function routeErrorMessage(error: ApiError, mode: TravelMode): string {
  if (error.kind === "network") {
    return "The route service cannot be reached. It may not be running.";
  }
  if (error.kind === "malformed") return "The route service sent a response we could not read.";
  switch (error.code) {
    case "no_route":
      return `No ${modeWord(mode)} route was found between these places.`;
    case "routing_not_configured":
      return "Routing is not set up on the server yet. The map and search still work.";
    case "routing_quota_exceeded":
      return "The route service is busy. Try again in a moment.";
    case "routing_timeout":
      return "The route service took too long to answer. Try again.";
    default:
      // Validation messages from our own API are safe and specific.
      return error.status === 422
        ? `These places cannot be used for a ${modeWord(mode)} route. They may be too far apart.`
        : "The route could not be calculated. Try again later.";
  }
}

export function RoutePanel({
  planner,
  dispatch,
  route,
  autocomplete,
  suggestionDebounceMs,
}: Props) {
  const problem = plannerProblem(planner);
  const loading = route.state.status === "loading";
  const active = route.state.status === "ready" ? route.state.route : null;
  const canSwap = planner.from.text !== "" || planner.to.text !== "";

  function submit() {
    const { selected: from } = planner.from;
    const { selected: to } = planner.to;
    if (from === null || to === null || problem !== null || loading) return;
    route.find(from, to, planner.mode);
  }

  function changeMode(mode: TravelMode) {
    if (mode === planner.mode) return;
    dispatch({ type: "setMode", mode });
    // The shown route was for the old mode. It is removed, and a new one is
    // only requested when Find route is pressed, so switching never costs money.
    route.clear();
  }

  return (
    <section className={styles.panel} aria-label="Plan a route">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <EndpointInput
          label="From"
          field={planner.from}
          autocomplete={autocomplete}
          debounceMs={suggestionDebounceMs}
          onType={(text) => dispatch({ type: "type", which: "from", text })}
          onSelect={(endpoint) => dispatch({ type: "select", which: "from", endpoint })}
        />
        <button
          type="button"
          className={styles.swap}
          disabled={!canSwap || loading}
          onClick={() => dispatch({ type: "swap" })}
        >
          ⇅ Swap from and to
        </button>
        <EndpointInput
          label="To"
          field={planner.to}
          autocomplete={autocomplete}
          debounceMs={suggestionDebounceMs}
          onType={(text) => dispatch({ type: "type", which: "to", text })}
          onSelect={(endpoint) => dispatch({ type: "select", which: "to", endpoint })}
        />

        <fieldset className={styles.modes}>
          <legend>Travel mode</legend>
          {TRAVEL_MODES.map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="travel-mode"
                value={mode}
                checked={planner.mode === mode}
                disabled={loading}
                onChange={() => changeMode(mode)}
              />
              <span aria-hidden="true">{MODE_ICONS[mode]} </span>
              {TRAVEL_MODE_LABELS[mode]}
            </label>
          ))}
        </fieldset>

        {problem === "same-place" && (
          <p className={styles.fieldProblem} role="alert">
            From and To are the same place. Choose two different places.
          </p>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={problem !== null || loading}>
            {loading ? "Finding route…" : "Find route"}
          </button>
          {route.state.status !== "idle" && (
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                route.clear();
                dispatch({ type: "reset" });
              }}
            >
              Clear route
            </button>
          )}
        </div>
      </form>

      {loading && <p role="status">Finding your {modeWord(planner.mode)} route…</p>}

      {route.state.status === "error" && (
        <div role="alert" className={styles.problem}>
          <p>
            <strong>The route could not be found.</strong>{" "}
            {routeErrorMessage(route.state.error, planner.mode)}
          </p>
        </div>
      )}

      {active && (
        <div className={styles.summary} role="status">
          <h2>{TRAVEL_MODE_LABELS[active.travelMode]} route</h2>
          <p className={styles.endpoints}>
            {active.origin.label} <span aria-hidden="true">→</span>
            <span className={styles.srOnly}> to </span> {active.destination.label}
          </p>
          <p className={styles.figures}>
            {formatRouteDistance(active.distanceMeters)} ·{" "}
            {formatRouteDuration(active.durationSeconds)}
          </p>
          {active.warnings.length > 0 && (
            <ul className={styles.warnings}>
              {active.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
