import type { AdmissionType, FieldSource, OpeningHours, PublicAccess } from "@/lib/api/places";

type YearFields = {
  year_built_start: number | null;
  year_built_end: number | null;
  year_is_approximate: boolean;
};

export function formatYearBuilt(place: YearFields): string | null {
  const { year_built_start: start, year_built_end: end } = place;
  if (start === null) return null;
  const range = end !== null && end !== start ? `${start}–${end}` : String(start);
  return place.year_is_approximate ? `c. ${range}` : range;
}

const ACCESS_LABELS: Record<PublicAccess, string> = {
  public: "Open to the public",
  exterior_only: "Exterior viewing only",
  by_appointment: "By appointment",
  private: "Private, not open to visitors",
  unknown: "Public access not confirmed",
};

const ADMISSION_LABELS: Record<AdmissionType, string> = {
  free: "Free admission",
  paid: "Paid admission",
  donation: "Admission by donation",
  unknown: "Admission not confirmed",
};

export function formatPublicAccess(value: PublicAccess): string {
  return ACCESS_LABELS[value];
}

export function formatAdmission(value: AdmissionType): string {
  return ADMISSION_LABELS[value];
}

export function formatArchitects(
  architects: readonly { name: string; role: string }[],
  withRoles = false,
): string | null {
  if (architects.length === 0) return null;
  return architects
    .map((a) => (withRoles && a.role !== "architect" ? `${a.name} (${a.role})` : a.name))
    .join(", ");
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatYesNoUnknown(value: boolean | null): string {
  if (value === null) return "Not confirmed";
  return value ? "Yes" : "No";
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "13:30:00" becomes "1:30 PM". */
export function formatTime(value: string): string {
  const [hourText, minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return value;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minuteText.padStart(2, "0")} ${suffix}`;
}

export type DayHours = { day: string; intervals: string[] };

/** Group intervals by weekday, Monday first. Days with no hours are left out. */
export function groupOpeningHours(hours: readonly OpeningHours[]): DayHours[] {
  const byDay = new Map<number, OpeningHours[]>();
  for (const entry of hours) {
    byDay.set(entry.day_of_week, [...(byDay.get(entry.day_of_week) ?? []), entry]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, entries]) => ({
      day: DAY_NAMES[day] ?? `Day ${day}`,
      intervals: entries
        .sort((a, b) => a.opens.localeCompare(b.opens))
        .map((e) => `${formatTime(e.opens)} – ${formatTime(e.closes)}`),
    }));
}

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  address: "address",
  location: "map location",
  architects: "architects",
  styles: "architectural style",
  year_built: "construction date",
  building_type: "building type",
  description: "description",
  significance_text: "historical significance",
  public_access: "public access",
  admission: "admission",
  reservation_required: "reservations",
  tours_available: "tours",
  accessibility: "accessibility",
  website_url: "website",
  opening_hours: "visiting hours",
  tags: "notable features",
};

export function formatFieldName(field: string): string {
  return FIELD_LABELS[field] ?? field.replaceAll("_", " ");
}

export type SourceGroup = {
  url: string;
  title: string;
  publisher: string;
  supports: string[];
};

/** One entry per source, listing the readable facts it supports. */
export function groupSources(fieldSources: readonly FieldSource[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const entry of fieldSources) {
    const group = groups.get(entry.source.url) ?? {
      url: entry.source.url,
      title: entry.source.title,
      publisher: entry.source.publisher,
      supports: [],
    };
    const label = formatFieldName(entry.field_name);
    if (!group.supports.includes(label)) group.supports.push(label);
    groups.set(entry.source.url, group);
  }
  return [...groups.values()].sort((a, b) => a.publisher.localeCompare(b.publisher));
}

export function formatAccessibility(
  accessibility: Record<string, unknown> | null,
): { label: string; value: string }[] {
  if (accessibility === null) return [];
  return Object.entries(accessibility).flatMap(([key, value]) => {
    const label = key.replaceAll("_", " ");
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    if (typeof value === "boolean") return [{ label: capitalized, value: value ? "Yes" : "No" }];
    if (typeof value === "string" || typeof value === "number") {
      return [{ label: capitalized, value: String(value) }];
    }
    return [];
  });
}

/** Only http and https links are ever rendered as links. */
export function safeExternalUrl(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}
