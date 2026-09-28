import type { RoutePlacesState } from "@/hooks/use-route-places";
import { formatDistanceFromRoute, formatPlaceCount } from "@/lib/format/route";

import styles from "./route.module.css";

type Props = {
  state: RoutePlacesState;
  filtered: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onClearFilters: () => void;
};

/** Architecture near the active route, in the order you would pass it. */
export function RouteResults({ state, filtered, selectedSlug, onSelect, onClearFilters }: Props) {
  if (state.status === "idle") return null;

  if (state.status === "error") {
    return (
      <div role="alert" className={styles.problem}>
        <p>
          <strong>Places near your route could not be loaded.</strong> Your route is still shown.
        </p>
        <button type="button" onClick={state.retry}>
          Try again
        </button>
      </div>
    );
  }

  const result = state.status === "ready" ? state.result : state.previous;
  const loading = state.status === "loading";
  const items = result?.items ?? [];

  let message: string;
  if (result === null) message = "Looking for architecture near your route…";
  else if (items.length === 0 && filtered)
    message = "No places near your route match these filters.";
  else if (items.length === 0) message = "No architecture has been added near this route yet.";
  else message = `${formatPlaceCount(result.total)} near your route${loading ? ". Updating…" : ""}`;

  return (
    <section className={styles.results} aria-labelledby="route-results-title">
      <h2 id="route-results-title">Architecture near your route</h2>
      <p role="status" className={styles.count}>
        {message}
      </p>

      {result !== null && items.length === 0 && filtered && (
        <button type="button" className={styles.primary} onClick={onClearFilters}>
          Clear filters
        </button>
      )}

      {items.length > 0 && (
        <>
          <ol className={styles.list}>
            {items.map(({ place, distance_from_route_meters }) => (
              <li key={place.slug}>
                <button
                  type="button"
                  aria-pressed={place.slug === selectedSlug}
                  onClick={() => onSelect(place.slug)}
                >
                  <strong>{place.name}</strong>
                  <span>
                    {[place.primary_style?.name, place.architects[0]?.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span>{formatDistanceFromRoute(distance_from_route_meters)}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className={styles.note}>
            Listed in the order you pass them, within about {Math.round(result!.corridor_meters)} m
            of the route. Distances are straight lines, so the actual trip to a place can be longer.
          </p>
        </>
      )}
    </section>
  );
}
