import type { ViewportPlaces } from "@/hooks/use-viewport-places";

import styles from "./explorer.module.css";

function countLabel(count: number): string {
  return count === 1 ? "1 place found in this map area" : `${count} places found in this map area`;
}

type Props = {
  viewport: ViewportPlaces;
  filtered: boolean;
  onClearFilters: () => void;
};

/** Says in words what the map is showing, for everyone including screen readers. */
export function ViewportStatus({ viewport, filtered, onClearFilters }: Props) {
  const { status, places, truncated, retry, error } = viewport;

  if (status === "error") {
    return (
      <div role="alert" className={styles.problem}>
        <p>
          <strong>Places could not be loaded.</strong>{" "}
          {error?.kind === "network"
            ? "The architecture service cannot be reached. It may not be running."
            : error?.kind === "malformed"
              ? "The architecture service sent a response we could not read."
              : "The architecture service reported a problem."}
        </p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  const emptyWithFilters = status === "ready" && places.length === 0 && filtered;

  let message: string;
  if (status === "waiting") message = "Waiting for the map…";
  else if (status === "loading") {
    message = places.length > 0 ? `${countLabel(places.length)}. Updating…` : "Loading places…";
  } else if (emptyWithFilters) {
    message = "No places match these filters in the current map area.";
  } else if (places.length === 0) {
    message =
      "No architecture has been added in this area yet. Move or zoom out the map to find some.";
  } else if (truncated) {
    message = `Showing the first ${places.length} places. Zoom in to see them all.`;
  } else message = countLabel(places.length);

  return (
    <div className={styles.statusBlock}>
      <p role="status" className={styles.status}>
        {message}
      </p>
      {emptyWithFilters && (
        <div className={styles.emptyActions}>
          <p>Try removing a filter or moving the map.</p>
          <button type="button" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
