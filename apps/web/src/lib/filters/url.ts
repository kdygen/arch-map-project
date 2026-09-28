import type { AdmissionType, PublicAccess } from "@/lib/api/places";

import {
  EMPTY_FILTERS,
  type FilterState,
  LIST_GROUPS,
  MAX_SEARCH_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  normalizeQuery,
  toApiParams,
  toSearchParams,
} from "./state";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PUBLIC_ACCESS: readonly PublicAccess[] = [
  "public",
  "exterior_only",
  "by_appointment",
  "private",
  "unknown",
];
const ADMISSION: readonly AdmissionType[] = ["free", "paid", "donation", "unknown"];
const MAX_VALUES = 20;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)].slice(0, MAX_VALUES);
}

function parseYear(value: string | null): number | null {
  if (value === null || !/^-?\d{1,4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

/**
 * Read filters from the page address. Anything invalid is ignored rather than
 * reported, because the address may have been edited or shared by hand.
 */
export function parseFilters(params: URLSearchParams): FilterState {
  const state: FilterState = { ...EMPTY_FILTERS };
  state.q = (params.get("q") ?? "").slice(0, MAX_SEARCH_LENGTH);

  for (const group of LIST_GROUPS) {
    const values = params.getAll(group);
    if (group === "public_access") {
      state.public_access = unique(
        values.filter((v): v is PublicAccess => PUBLIC_ACCESS.includes(v as PublicAccess)),
      );
    } else if (group === "admission_type") {
      state.admission_type = unique(
        values.filter((v): v is AdmissionType => ADMISSION.includes(v as AdmissionType)),
      );
    } else {
      state[group] = unique(values.filter((v) => SLUG.test(v)));
    }
  }

  const tours = params.get("tours_available");
  state.tours_available = tours === "true" ? true : tours === "false" ? false : null;
  state.year_from = parseYear(params.get("year_from"));
  state.year_to = parseYear(params.get("year_to"));
  return state;
}

/** The query string for the page address, without a leading "?". */
export function serializeFilters(state: FilterState): string {
  const params = toApiParams(state);
  // Keep the search in the address even while it is too long to send.
  const q = normalizeQuery(state.q);
  if (q !== "") params.q = q;
  return toSearchParams(params).toString();
}
