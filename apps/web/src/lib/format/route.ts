const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** "2.8 mi", or feet for very short walks. */
export function formatRouteDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round(meters / METERS_PER_FOOT / 10) * 10} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** "58 min" or "1 hr 5 min". Never shows less than a minute. */
export function formatRouteDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * Straight-line distance from the route, rounded so it does not look more
 * exact than it is. This is not a detour time.
 */
export function formatDistanceFromRoute(meters: number): string {
  if (meters < 15) return "On your route";
  const rounded = meters < 100 ? Math.round(meters / 10) * 10 : Math.round(meters / 25) * 25;
  return `About ${rounded} m from your route`;
}

export function formatPlaceCount(count: number): string {
  return count === 1 ? "1 place" : `${count} places`;
}
