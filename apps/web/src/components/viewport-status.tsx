import type { ViewportPlaces } from "@/hooks/use-viewport-places";

import styles from "./explorer.module.css";

function countLabel(count: number): string {
  if (count === 1) return "1 place in view";
  return `${count} places in view`;
}

/** Says in words what the map is showing, for everyone including screen readers. */
export function ViewportStatus({ viewport }: { viewport: ViewportPlaces }) {
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

  let message: string;
  if (status === "waiting") message = "Waiting for the map…";
  else if (status === "loading") {
    message = places.length > 0 ? `${countLabel(places.length)}. Updating…` : "Loading places…";
  } else if (places.length === 0) {
    message = "No places in this area. Move or zoom out the map to find some.";
  } else if (truncated) {
    message = `Showing the first ${places.length} places. Zoom in to see them all.`;
  } else message = countLabel(places.length);

  return (
    <p role="status" className={styles.status}>
      {message}
    </p>
  );
}
