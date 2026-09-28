/** A chosen start or end point. Always structured, never free text. */
export type Endpoint = {
  label: string;
  lat: number;
  lng: number;
  placeId?: string;
};

/** Travel modes the backend accepts. Walking is the default. */
export type TravelMode = "walking" | "driving";

export const TRAVEL_MODES: readonly TravelMode[] = ["walking", "driving"];
export const DEFAULT_TRAVEL_MODE: TravelMode = "walking";

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  walking: "Walking",
  driving: "Driving",
};

export type Route = {
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
  travelMode: TravelMode;
  warnings: string[];
  origin: Endpoint;
  destination: Endpoint;
};

export function sameLocation(a: Endpoint, b: Endpoint): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

/** Identifies a route request. Equal keys mean an identical paid request. */
export function routeKey(origin: Endpoint, destination: Endpoint, mode: TravelMode): string {
  return [origin.lat, origin.lng, destination.lat, destination.lng, mode].join(",");
}
