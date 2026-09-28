import type { FilterOptionsState } from "@/hooks/use-filter-options";
import {
  type FilterAction,
  type FilterState,
  hasAnyFilter,
  type ListGroup,
} from "@/lib/filters/state";
import { accessFilterLabel, admissionFilterLabel } from "@/lib/format/place";

import styles from "./filters.module.css";

type Props = {
  state: FilterState;
  dispatch: (action: FilterAction) => void;
  options: FilterOptionsState;
};

type Chip = { key: string; label: string; remove: FilterAction };

const GROUP_LABELS: Record<ListGroup, string> = {
  architect: "Architect",
  style: "Style",
  building_type: "Type",
  period: "Period",
  tag: "Feature",
  public_access: "Access",
  admission_type: "Admission",
};

function nameLookup(options: FilterOptionsState): Map<string, string> {
  const names = new Map<string, string>();
  if (options.status !== "ready") return names;
  const o = options.options;
  for (const [group, list] of [
    ["architect", o.architects],
    ["style", o.styles],
    ["building_type", o.building_types],
    ["period", o.periods],
    ["tag", o.tag_categories.flatMap((c) => c.tags)],
  ] as const) {
    for (const item of list) names.set(`${group}:${item.slug}`, item.name);
  }
  return names;
}

/** The applied choices in words, each removable, plus Clear all. */
export function ActiveFilters({ state, dispatch, options }: Props) {
  if (!hasAnyFilter(state)) return null;

  const names = nameLookup(options);
  const chips: Chip[] = [];
  for (const group of Object.keys(GROUP_LABELS) as ListGroup[]) {
    for (const value of state[group] as string[]) {
      const name =
        group === "public_access"
          ? accessFilterLabel(value)
          : group === "admission_type"
            ? admissionFilterLabel(value)
            : (names.get(`${group}:${value}`) ?? value);
      chips.push({
        key: `${group}:${value}`,
        label: `${GROUP_LABELS[group]}: ${name}`,
        remove: { type: "toggle", group, value },
      });
    }
  }
  if (state.year_from !== null || state.year_to !== null) {
    const from = state.year_from ?? "any";
    const to = state.year_to ?? "any";
    chips.push({ key: "years", label: `Built: ${from}–${to}`, remove: { type: "clearYears" } });
  }
  if (state.tours_available !== null) {
    chips.push({
      key: "tours",
      label: "Tours available",
      remove: { type: "setTours", value: null },
    });
  }

  return (
    <div className={styles.active}>
      {chips.length > 0 && (
        <ul aria-label="Active filters" className={styles.chips}>
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                aria-label={`Remove filter: ${chip.label}`}
                onClick={() => dispatch(chip.remove)}
              >
                {chip.label}
                <span aria-hidden="true"> ×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={styles.clearAll}
        onClick={() => dispatch({ type: "clearAll" })}
      >
        Clear all filters
      </button>
    </div>
  );
}
