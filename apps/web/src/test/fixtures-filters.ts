import type { FilterOptions } from "@/lib/api/filters";

/** Fictional filter options for tests. Real options only come from the API. */
export function makeFilterOptions(overrides: Partial<FilterOptions> = {}): FilterOptions {
  return {
    architects: [
      { slug: "a-one", name: "A. One", count: 1 },
      { slug: "b-two", name: "B. Two", count: 1 },
    ],
    styles: [
      { slug: "classical", name: "Classical", count: 1 },
      { slug: "modernism", name: "Modernism", count: 1 },
    ],
    periods: [
      { slug: "old", name: "Old", count: 1, start_year: 1700, end_year: 1899 },
      { slug: "new", name: "New", count: 1, start_year: 1900, end_year: null },
    ],
    building_types: [
      { slug: "hall", name: "Hall", count: 1 },
      { slug: "house", name: "House", count: 1 },
    ],
    tag_categories: [
      { category: "feature", tags: [{ slug: "dome", name: "Dome", count: 1 }] },
      { category: "material", tags: [{ slug: "brick", name: "Brick", count: 1 }] },
    ],
    public_access: [
      { value: "exterior_only", count: 1 },
      { value: "public", count: 1 },
    ],
    admission_types: [
      { value: "paid", count: 1 },
      { value: "unknown", count: 1 },
    ],
    year_built: { min: 1795, max: 1949 },
    ...overrides,
  };
}
