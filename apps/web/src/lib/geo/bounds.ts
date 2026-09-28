/**
 * A latitude/longitude rectangle in decimal degrees.
 * `west` greater than `east` means the box crosses the antimeridian.
 * This is our own type, so nothing outside the map components depends on Google.
 */
export type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/** Four decimals is about 11 meters, so tiny map jitter maps to the same box. */
const PRECISION = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  const rounded = Number(value.toFixed(PRECISION));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function isValidBounds(bounds: Bounds): boolean {
  return (
    [bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) &&
    bounds.south <= bounds.north
  );
}

/** Clamp to the valid coordinate range and round to a stable precision. */
export function normalizeBounds(bounds: Bounds): Bounds {
  return {
    west: round(clamp(bounds.west, -180, 180)),
    south: round(clamp(bounds.south, -90, 90)),
    east: round(clamp(bounds.east, -180, 180)),
    north: round(clamp(bounds.north, -90, 90)),
  };
}

/** The `bbox` query value the API expects: west,south,east,north. */
export function toBboxParam(bounds: Bounds): string {
  const b = normalizeBounds(bounds);
  return [b.west, b.south, b.east, b.north].join(",");
}

export function crossesAntimeridian(bounds: Bounds): boolean {
  return bounds.west > bounds.east;
}

export function containsPoint(bounds: Bounds, latitude: number, longitude: number): boolean {
  if (latitude < bounds.south || latitude > bounds.north) return false;
  if (crossesAntimeridian(bounds)) {
    return longitude >= bounds.west || longitude <= bounds.east;
  }
  return longitude >= bounds.west && longitude <= bounds.east;
}

/** True when `inner` lies fully inside `outer`. Conservative near the antimeridian. */
export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  if (crossesAntimeridian(outer) || crossesAntimeridian(inner)) return false;
  return (
    inner.west >= outer.west &&
    inner.east <= outer.east &&
    inner.south >= outer.south &&
    inner.north <= outer.north
  );
}
