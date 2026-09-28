import {
  type FilterAction,
  MAX_SEARCH_LENGTH,
  MAX_SEARCH_WORDS,
  searchProblem,
} from "@/lib/filters/state";

import styles from "./filters.module.css";

type Props = {
  q: string;
  dispatch: (action: FilterAction) => void;
};

export function SearchBox({ q, dispatch }: Props) {
  const problem = searchProblem(q);
  return (
    <form role="search" className={styles.search} onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="place-search" className={styles.srOnly}>
        Search architecture
      </label>
      <input
        id="place-search"
        type="search"
        placeholder="Search architecture, architects, styles…"
        value={q}
        maxLength={MAX_SEARCH_LENGTH}
        autoComplete="off"
        aria-describedby={problem ? "place-search-problem" : undefined}
        aria-invalid={problem !== null}
        onChange={(event) => dispatch({ type: "setQuery", q: event.target.value })}
      />
      {q !== "" && (
        <button
          type="button"
          className={styles.clearSearch}
          aria-label="Clear search"
          onClick={() => dispatch({ type: "setQuery", q: "" })}
        >
          Clear
        </button>
      )}
      {problem === "too-many-words" && (
        <p id="place-search-problem" className={styles.fieldProblem}>
          Search uses up to {MAX_SEARCH_WORDS} words. Remove some to search.
        </p>
      )}
    </form>
  );
}
