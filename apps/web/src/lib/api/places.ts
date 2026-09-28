import { z } from "zod";

import type { ApiFilterParams } from "@/lib/filters/state";
import { type Bounds, toBboxParam } from "@/lib/geo/bounds";

import { apiGet } from "./client";

const namedRef = z.object({ slug: z.string(), name: z.string() });
const architectRef = namedRef.extend({ role: z.string() });
const publicAccess = z.enum(["public", "exterior_only", "by_appointment", "private", "unknown"]);
const admissionType = z.enum(["free", "paid", "donation", "unknown"]);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const placeSummarySchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  name: z.string().min(1),
  latitude,
  longitude,
  year_built_start: z.number().int().nullable(),
  year_built_end: z.number().int().nullable(),
  year_is_approximate: z.boolean(),
  building_type: namedRef.nullable(),
  primary_style: namedRef.nullable(),
  architects: z.array(architectRef),
  public_access: publicAccess,
  admission_type: admissionType,
  tours_available: z.boolean().nullable(),
  significance_score: z.number().int().nullable(),
  visit_minutes_exterior: z.number().int().nullable(),
  visit_minutes_interior: z.number().int().nullable(),
});

const placeListSchema = z.object({
  items: z.array(placeSummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});

const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string(),
  source_type: z.string(),
  accessed_at: z.string(),
});

const placeDetailSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  name: z.string().min(1),
  latitude,
  longitude,
  address_line: z.string().nullable(),
  city: namedRef.extend({ region: z.string().nullable(), country_code: z.string() }),
  country_code: z.string(),
  timezone: z.string(),
  year_built_start: z.number().int().nullable(),
  year_built_end: z.number().int().nullable(),
  year_is_approximate: z.boolean(),
  building_type: namedRef.nullable(),
  period: namedRef
    .extend({ start_year: z.number().nullable(), end_year: z.number().nullable() })
    .nullable(),
  architects: z.array(architectRef),
  styles: z.array(namedRef.extend({ is_primary: z.boolean() })),
  tags: z.array(namedRef.extend({ category: z.string() })),
  description: z.string().nullable(),
  significance_text: z.string().nullable(),
  public_access: publicAccess,
  admission_type: admissionType,
  admission_notes: z.string().nullable(),
  reservation_required: z.boolean().nullable(),
  tours_available: z.boolean().nullable(),
  accessibility: z.record(z.string(), z.unknown()).nullable(),
  website_url: z.string().nullable(),
  images: z.array(
    z.object({
      storage_path: z.string(),
      credit: z.string(),
      license: z.string(),
      source_url: z.string(),
      sort_order: z.number(),
    }),
  ),
  opening_hours: z.array(
    z.object({
      day_of_week: z.number().int().min(0).max(6),
      opens: z.string(),
      closes: z.string(),
      valid_from: z.string().nullable(),
      valid_to: z.string().nullable(),
    }),
  ),
  curated: z.object({
    significance_score: z.number().int().nullable(),
    visit_minutes_exterior: z.number().int().nullable(),
    visit_minutes_interior: z.number().int().nullable(),
  }),
  field_sources: z.array(
    z.object({ field_name: z.string(), note: z.string().nullable(), source: sourceSchema }),
  ),
});

export type PlaceSummary = z.infer<typeof placeSummarySchema>;
export type PlaceList = z.infer<typeof placeListSchema>;
export type PlaceDetail = z.infer<typeof placeDetailSchema>;
export type PublicAccess = z.infer<typeof publicAccess>;
export type AdmissionType = z.infer<typeof admissionType>;
export type OpeningHours = PlaceDetail["opening_hours"][number];
export type FieldSource = PlaceDetail["field_sources"][number];

/** The most places we ask for in one viewport. Matches the API maximum. */
export const VIEWPORT_LIMIT = 500;

/** Places inside `bounds` that match the filters. PostGIS does the filtering. */
export function listPlacesInBounds(
  bounds: Bounds,
  filters: ApiFilterParams = {},
  signal?: AbortSignal,
): Promise<PlaceList> {
  return apiGet("/places", {
    schema: placeListSchema,
    params: { ...filters, bbox: toBboxParam(bounds), limit: VIEWPORT_LIMIT },
    signal,
  });
}

export function getPlace(slug: string, signal?: AbortSignal): Promise<PlaceDetail> {
  return apiGet(`/places/${encodeURIComponent(slug)}`, { schema: placeDetailSchema, signal });
}
