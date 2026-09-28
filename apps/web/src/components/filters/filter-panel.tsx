import type { ReactNode } from "react";

import type { FilterOptionsState } from "@/hooks/use-filter-options";
import {
  type FilterAction,
  type FilterState,
  hasStructuredFilters,
  type ListGroup,
  MAX_YEAR,
  MIN_YEAR,
  yearRangeIsInvalid,
} from "@/lib/filters/state";
import { accessFilterLabel, admissionFilterLabel, tagCategoryLabel } from "@/lib/format/place";

import styles from "./filters.module.css";

type Choice = { value: string; label: string; category?: string };

type Props = {
  state: FilterState;
  dispatch: (action: FilterAction) => void;
  options: FilterOptionsState;
};

function activeCount(state: FilterState): number {
  const lists: ListGroup[] = [
    "architect",
    "style",
    "building_type",
    "period",
    "tag",
    "public_access",
    "admission_type",
  ];
  return (
    lists.reduce((sum, group) => sum + state[group].length, 0) +
    (state.tours_available !== null ? 1 : 0) +
    (state.year_from !== null || state.year_to !== null ? 1 : 0)
  );
}

/** All structured filters. Option lists come from GET /api/v1/filters. */
export function FilterPanel({ state, dispatch, options }: Props) {
  const count = activeCount(state);

  return (
    <details className={styles.panel}>
      <summary>
        Filters
        {count > 0 && <span className={styles.badge}>{count} active</span>}
      </summary>

      {options.status === "loading" && <p className={styles.help}>Loading filters…</p>}

      {options.status === "error" && (
        <div role="alert" className={styles.problem}>
          <p>Filter choices could not be loaded.</p>
          <button type="button" onClick={options.retry}>
            Try again
          </button>
        </div>
      )}

      {options.status === "ready" && (
        <div className={styles.groups}>
          <p className={styles.help}>
            Choices within one group match any of them. Different groups must all match.
          </p>

          <ChoiceGroup
            title="Style"
            group="style"
            state={state}
            dispatch={dispatch}
            choices={options.options.styles.map((o) => ({ value: o.slug, label: o.name }))}
            note="Includes related sub-styles."
          />
          <ChoiceGroup
            title="Architect"
            group="architect"
            state={state}
            dispatch={dispatch}
            choices={options.options.architects.map((o) => ({ value: o.slug, label: o.name }))}
          />
          <ChoiceGroup
            title="Building type"
            group="building_type"
            state={state}
            dispatch={dispatch}
            choices={options.options.building_types.map((o) => ({ value: o.slug, label: o.name }))}
          />
          <ChoiceGroup
            title="Period"
            group="period"
            state={state}
            dispatch={dispatch}
            choices={options.options.periods.map((o) => ({ value: o.slug, label: periodLabel(o) }))}
          />

          <YearRange state={state} dispatch={dispatch} range={options.options.year_built} />

          <ChoiceGroup
            title="Public access"
            group="public_access"
            state={state}
            dispatch={dispatch}
            choices={options.options.public_access.map((o) => ({
              value: o.value,
              label: accessFilterLabel(o.value),
            }))}
          />
          <ChoiceGroup
            title="Admission"
            group="admission_type"
            state={state}
            dispatch={dispatch}
            choices={options.options.admission_types.map((o) => ({
              value: o.value,
              label: admissionFilterLabel(o.value),
            }))}
          />

          <Section title="Tours" active={state.tours_available !== null ? 1 : 0}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={state.tours_available === true}
                onChange={(event) =>
                  dispatch({ type: "setTours", value: event.target.checked ? true : null })
                }
              />
              Tours available
            </label>
          </Section>

          {options.options.tag_categories.length > 0 && (
            <ChoiceGroup
              title="Features"
              group="tag"
              state={state}
              dispatch={dispatch}
              note="A place must have every feature you choose."
              choices={options.options.tag_categories.flatMap((category) =>
                category.tags.map((tag) => ({
                  value: tag.slug,
                  label: tag.name,
                  category: tagCategoryLabel(category.category),
                })),
              )}
            />
          )}
        </div>
      )}

      {options.status !== "ready" && hasStructuredFilters(state) && (
        <p className={styles.help}>Filters from the page address are still applied.</p>
      )}
    </details>
  );
}

function periodLabel(period: {
  name: string;
  start_year: number | null;
  end_year: number | null;
}): string {
  if (period.start_year === null) return period.name;
  const end = period.end_year === null ? "present" : String(period.end_year);
  return `${period.name} (${period.start_year}–${end})`;
}

function Section({
  title,
  active,
  children,
}: {
  title: string;
  active: number;
  children: ReactNode;
}) {
  return (
    <details className={styles.group}>
      <summary>
        {title}
        {active > 0 && <span className={styles.badge}>{active} selected</span>}
      </summary>
      <div className={styles.groupBody}>{children}</div>
    </details>
  );
}

type ChoiceGroupProps = {
  title: string;
  group: ListGroup;
  state: FilterState;
  dispatch: (action: FilterAction) => void;
  choices: Choice[];
  note?: string;
};

function ChoiceGroup({ title, group, state, dispatch, choices, note }: ChoiceGroupProps) {
  const selected = state[group] as string[];
  // A value from a shared address may not be offered any more. Show it anyway so it can be removed.
  const missing = selected.filter((value) => !choices.some((c) => c.value === value));
  const all: Choice[] = [
    ...choices,
    ...missing.map((value) => ({ value, label: `${value} (unavailable)` })),
  ];
  if (all.length === 0) return null;

  let lastCategory: string | undefined;
  return (
    <Section title={title} active={selected.length}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.srOnly}>{title}</legend>
        {note && <p className={styles.help}>{note}</p>}
        {all.map((choice) => {
          const category = choice.category;
          const heading = category !== undefined && category !== lastCategory ? category : null;
          lastCategory = category;
          return (
            <div key={choice.value}>
              {heading && <p className={styles.category}>{heading}</p>}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={selected.includes(choice.value)}
                  onChange={() => dispatch({ type: "toggle", group, value: choice.value })}
                />
                {choice.label}
              </label>
            </div>
          );
        })}
      </fieldset>
    </Section>
  );
}

function parseYearInput(value: string): number | null {
  if (!/^-?\d{1,4}$/.test(value.trim())) return null;
  const year = Number(value);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

function YearRange({
  state,
  dispatch,
  range,
}: {
  state: FilterState;
  dispatch: (action: FilterAction) => void;
  range: { min: number | null; max: number | null };
}) {
  const invalid = yearRangeIsInvalid(state);
  const active = state.year_from !== null || state.year_to !== null ? 1 : 0;
  return (
    <Section title="Construction year" active={active}>
      <fieldset className={styles.fieldset} aria-describedby="year-help">
        <legend className={styles.srOnly}>Construction year</legend>
        <div className={styles.years}>
          <label>
            From
            <input
              type="number"
              inputMode="numeric"
              placeholder={range.min !== null ? String(range.min) : undefined}
              value={state.year_from ?? ""}
              aria-invalid={invalid}
              onChange={(event) =>
                dispatch({
                  type: "setYear",
                  bound: "year_from",
                  value: parseYearInput(event.target.value),
                })
              }
            />
          </label>
          <label>
            To
            <input
              type="number"
              inputMode="numeric"
              placeholder={range.max !== null ? String(range.max) : undefined}
              value={state.year_to ?? ""}
              aria-invalid={invalid}
              onChange={(event) =>
                dispatch({
                  type: "setYear",
                  bound: "year_to",
                  value: parseYearInput(event.target.value),
                })
              }
            />
          </label>
        </div>
        <p id="year-help" className={styles.help}>
          A building matches if any part of its construction falls in this range.
        </p>
        {invalid && (
          <p className={styles.fieldProblem} role="alert">
            The start year is after the end year, so the year filter is not applied.
          </p>
        )}
      </fieldset>
    </Section>
  );
}
