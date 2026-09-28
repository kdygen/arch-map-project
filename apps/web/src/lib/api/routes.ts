import { z } from "zod";

import type { ApiFilterParams } from "@/lib/filters/state";
import type { Endpoint, Route, TravelMode } from "@/lib/routing/types";

import { apiPost } from "./client";
import { placeSummarySchema } from "./places";

const routeResponseSchema = z.object({
  route: z.object({
    polyline: z.string().min(1),
    distance_meters: z.number().int().nonnegative(),
    duration_seconds: z.number().int().nonnegative(),
    travel_mode: z.enum(["walking", "driving"]),
    warnings: z.array(z.string()),
  }),
});

const routePlaceSchema = z.object({
  place: placeSummarySchema,
  distance_from_route_meters: z.number().nonnegative(),
  route_progress: z.number().min(0).max(1),
});

const routePlacesSchema = z.object({
  items: z.array(routePlaceSchema),
  total: z.number().int().nonnegative(),
  corridor_meters: z.number().positive(),
});

export type RoutePlace = z.infer<typeof routePlaceSchema>;
export type RoutePlaces = z.infer<typeof routePlacesSchema>;

/**
 * Ask our backend for a route. The backend calls the routing provider with
 * its own key, so each call here is one paid request. Only coordinates are
 * sent, never the text the user typed.
 */
export async function computeRoute(
  origin: Endpoint,
  destination: Endpoint,
  travelMode: TravelMode,
  signal?: AbortSignal,
): Promise<Route> {
  const { route } = await apiPost(
    "/routes",
    {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travel_mode: travelMode,
    },
    { schema: routeResponseSchema, signal },
  );
  return {
    polyline: route.polyline,
    distanceMeters: route.distance_meters,
    durationSeconds: route.duration_seconds,
    travelMode: route.travel_mode,
    warnings: route.warnings,
    origin,
    destination,
  };
}

/** Filters as the JSON body expects them: numbers and booleans, not strings. */
export function toFilterBody(params: ApiFilterParams): Record<string, unknown> {
  const { tours_available, year_from, year_to, ...rest } = params;
  return {
    ...rest,
    ...(tours_available !== undefined && { tours_available: tours_available === "true" }),
    ...(year_from !== undefined && { year_from: Number(year_from) }),
    ...(year_to !== undefined && { year_to: Number(year_to) }),
  };
}

/** Places near a route. Uses only our database, so it costs nothing to repeat. */
export function listPlacesNearRoute(
  polyline: string,
  filters: ApiFilterParams = {},
  signal?: AbortSignal,
): Promise<RoutePlaces> {
  return apiPost(
    "/routes/nearby-places",
    { polyline, filters: toFilterBody(filters), limit: 500 },
    { schema: routePlacesSchema, signal },
  );
}
