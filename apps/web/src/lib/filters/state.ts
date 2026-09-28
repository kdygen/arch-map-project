import type { AdmissionType, PublicAccess } from "@/lib/api/places";

/**
 * Everything the user has chosen to narrow the catalog. This is the single
 * source of truth for search and filters. Parameter names match the API.
 */
export type FilterState = {
  q: string;
  architect: string[];
  style: string[];
  building_type: string[];
  period: string[];
  tag: string[];
  public_access: PublicAccess[];
  admission_type: AdmissionType[];
  tours_available: boolean | null;
  year_from: number | null;
  year_to: number | null;
};

export type ListGroup =
  "architect" | "style" | "building_type" | "period" | "tag" | "public_access" | "admission_type";

export const LIST_GROUPS: readonly ListGroup[] = [
  "architect",
  "style",
  "building_type",
  "period",
  "tag",
  "public_access",
  "admission_type",
];

export const EMPTY_FILTERS: FilterState = {
  q: "",
  architect: [],
  style: [],
  building_type: [],
  period: [],
  tag: [],
  public_access: [],
  admission_type: [],
  tours_available: null,
  year_from: null,
  year_to: null,
};

/** Must match the API limits in app/catalog/search.py. */
export const MAX_SEARCH_LENGTH = 100;
export const MAX_SEARCH_WORDS = 8;
export const MIN_YEAR = -3000;
export const MAX_YEAR = 3000;

export type FilterAction =
  | { type: "setQuery"; q: string }
  | { type: "toggle"; group: ListGroup; value: string }
  | { type: "setYear"; bound: "year_from" | "year_to"; value: number | null }
  | { type: "setTours"; value: boolean | null }
  | { type: "clearYears" }
  | { type: "clearAll" };

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "setQuery":
      return state.q === action.q ? state : { ...state, q: action.q };
    case "toggle": {
      const current = state[action.group] as string[];
      const next = current.includes(action.value)
        ? current.filter((v) => v !== action.value)
        : [...current, action.value];
      return { ...state, [action.group]: next };
    }
    case "setYear":
      return state[action.bound] === action.value
        ? state
        : { ...state, [action.bound]: action.value };
    case "setTours":
      return { ...state, tours_available: action.value };
    case "clearYears":
      return { ...state, year_from: null, year_to: null };
    case "clearAll":
      return EMPTY_FILTERS;
  }
}

/** Trim and collapse whitespace, as the API does. */
export function normalizeQuery(q: string): string {
  return q.trim().split(/\s+/).filter(Boolean).join(" ");
}

export type SearchProblem = "too-long" | "too-many-words" | null;

export function searchProblem(q: string): SearchProblem {
  const normalized = normalizeQuery(q);
  if (normalized.length > MAX_SEARCH_LENGTH) return "too-long";
  if (new Set(normalized.toLowerCase().split(" ")).size > MAX_SEARCH_WORDS) {
    return "too-many-words";
  }
  return null;
}

export function yearRangeIsInvalid(state: FilterState): boolean {
  return state.year_from !== null && state.year_to !== null && state.year_from > state.year_to;
}

/** True when any filter other than the text search is set. */
export function hasStructuredFilters(state: FilterState): boolean {
  return (
    LIST_GROUPS.some((group) => state[group].length > 0) ||
    state.tours_available !== null ||
    state.year_from !== null ||
    state.year_to !== null
  );
}

export function hasAnyFilter(state: FilterState): boolean {
  return normalizeQuery(state.q) !== "" || hasStructuredFilters(state);
}

export type ApiFilterParams = Partial<Record<ListGroup, string[]>> & {
  q?: string;
  tours_available?: "true" | "false";
  year_from?: string;
  year_to?: string;
};

/**
 * The query parameters sent to GET /api/v1/places. Values that the API would
 * reject, such as a reversed year range, are left out. Lists are sorted, so
 * the same choices always produce the same parameters.
 */
export function toApiParams(state: FilterState): ApiFilterParams {
  const params: ApiFilterParams = {};
  const q = normalizeQuery(state.q);
  if (q !== "" && searchProblem(q) === null) params.q = q;
  for (const group of LIST_GROUPS) {
    if (state[group].length > 0) params[group] = [...state[group]].sort();
  }
  if (state.tours_available !== null)
    params.tours_available = String(state.tours_available) as "true" | "false";
  if (!yearRangeIsInvalid(state)) {
    if (state.year_from !== null) params.year_from = String(state.year_from);
    if (state.year_to !== null) params.year_to = String(state.year_to);
  }
  return params;
}

export function toSearchParams(params: ApiFilterParams): URLSearchParams {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(name, item));
    else search.append(name, value);
  }
  return search;
}

/** A stable string that changes exactly when the API request would change. */
export function filterKey(state: FilterState): string {
  return toSearchParams(toApiParams(state)).toString();
}
