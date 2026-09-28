import type { PlaceDetail, PlaceSummary } from "@/lib/api/places";

/** Fictional places for tests. Real data only ever comes from the API. */
export function makeSummary(overrides: Partial<PlaceSummary> = {}): PlaceSummary {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "alpha-house",
    name: "Alpha House",
    latitude: 42.36,
    longitude: -71.06,
    year_built_start: 1795,
    year_built_end: 1800,
    year_is_approximate: false,
    building_type: { slug: "house", name: "House" },
    primary_style: { slug: "classical", name: "Classical" },
    architects: [{ slug: "a-one", name: "A. One", role: "architect" }],
    public_access: "public",
    admission_type: "paid",
    tours_available: true,
    significance_score: 5,
    visit_minutes_exterior: 15,
    visit_minutes_interior: 60,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "alpha-house",
    name: "Alpha House",
    latitude: 42.36,
    longitude: -71.06,
    address_line: "1 Test Street, Testville",
    city: { slug: "testville", name: "Testville", region: "Test Region", country_code: "US" },
    country_code: "US",
    timezone: "America/New_York",
    year_built_start: 1795,
    year_built_end: 1800,
    year_is_approximate: false,
    building_type: { slug: "house", name: "House" },
    period: { slug: "old", name: "Old", start_year: 1700, end_year: 1899 },
    architects: [{ slug: "a-one", name: "A. One", role: "architect" }],
    styles: [{ slug: "classical", name: "Classical", is_primary: true }],
    tags: [{ slug: "dome", name: "Dome", category: "feature" }],
    description: "A fictional house used in tests.",
    significance_text: "Important to the test suite.",
    public_access: "public",
    admission_type: "paid",
    admission_notes: "Ticket required.",
    reservation_required: false,
    tours_available: true,
    accessibility: { elevator: false },
    website_url: "https://example.org/alpha",
    images: [],
    opening_hours: [
      { day_of_week: 0, opens: "10:00:00", closes: "12:00:00", valid_from: null, valid_to: null },
      { day_of_week: 0, opens: "13:00:00", closes: "17:00:00", valid_from: null, valid_to: null },
      { day_of_week: 2, opens: "10:00:00", closes: "17:00:00", valid_from: null, valid_to: null },
    ],
    curated: { significance_score: 5, visit_minutes_exterior: 15, visit_minutes_interior: 60 },
    field_sources: [
      {
        field_name: "year_built",
        note: "Built in 1795",
        source: {
          title: "Example reference",
          url: "https://example.org/reference",
          publisher: "Example Org",
          source_type: "official_site",
          accessed_at: "2026-01-15",
        },
      },
      {
        field_name: "architects",
        note: null,
        source: {
          title: "Example reference",
          url: "https://example.org/reference",
          publisher: "Example Org",
          source_type: "official_site",
          accessed_at: "2026-01-15",
        },
      },
    ],
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
