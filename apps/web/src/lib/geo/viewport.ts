import type { PlaceSummary } from "@/lib/api/places";

import { type Bounds, containsBounds, containsPoint } from "./bounds";

/** The result of one viewport request. */
export type Coverage = {
  bounds: Bounds;
  places: PlaceSummary[];
  /** True when the API returned every place in `bounds`, not just one page. */
  complete: boolean;
};

/**
 * True when a new viewport needs no request, because an earlier complete
 * result already covers it. Zooming in is the common case.
 */
export function isCovered(coverage: Coverage | null, viewport: Bounds): boolean {
  return coverage !== null && coverage.complete && containsBounds(coverage.bounds, viewport);
}

export function placesInViewport(places: PlaceSummary[], viewport: Bounds): PlaceSummary[] {
  return places.filter((place) => containsPoint(viewport, place.latitude, place.longitude));
}
