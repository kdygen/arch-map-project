"use client";

import { type KeyboardEvent, useEffect, useId, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  MIN_SUGGESTION_INPUT,
  type PlaceAutocomplete,
  SUGGESTION_DEBOUNCE_MS,
  type Suggestion,
} from "@/lib/routing/autocomplete";
import type { EndpointField } from "@/lib/routing/planner-state";
import type { Endpoint } from "@/lib/routing/types";

import styles from "./route.module.css";

type Props = {
  label: string;
  field: EndpointField;
  autocomplete: PlaceAutocomplete;
  onType: (text: string) => void;
  onSelect: (endpoint: Endpoint) => void;
  debounceMs?: number;
};

type Found = { query: string; items: Suggestion[] } | { query: string; failed: true };

/**
 * A location search box. The text alone is never used for routing: a route
 * needs a suggestion to be chosen, which supplies real coordinates.
 */
export function EndpointInput({
  label,
  field,
  autocomplete,
  onType,
  onSelect,
  debounceMs = SUGGESTION_DEBOUNCE_MS,
}: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);

  const query = field.text.trim();
  const debounced = useDebouncedValue(query, debounceMs);
  const searchable =
    autocomplete.status === "ready" &&
    field.selected === null &&
    debounced.length >= MIN_SUGGESTION_INPUT &&
    debounced === query;

  useEffect(() => {
    if (!searchable || autocomplete.status !== "ready") return;
    let current = true;
    autocomplete.suggest(debounced).then(
      (items) => current && setFound({ query: debounced, items }),
      () => current && setFound({ query: debounced, failed: true }),
    );
    return () => {
      current = false;
    };
  }, [searchable, debounced, autocomplete]);

  const result = searchable && found?.query === debounced ? found : null;
  const items = result && "items" in result ? result.items : [];
  const open = focused && items.length > 0 && dismissed !== debounced && !resolving;
  const activeIndex = Math.min(active, Math.max(items.length - 1, 0));

  async function choose(suggestion: Suggestion) {
    if (autocomplete.status !== "ready") return;
    setResolving(true);
    setResolveFailed(false);
    try {
      onSelect(await autocomplete.resolve(suggestion));
    } catch {
      setResolveFailed(true);
    } finally {
      setResolving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setDismissed(debounced);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeIndex - 1 + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void choose(items[activeIndex]);
    }
  }

  let hint: string;
  if (autocomplete.status === "unavailable") hint = "Location search is unavailable.";
  else if (autocomplete.status === "loading") hint = "Location search is loading…";
  else if (resolving) hint = "Getting the location…";
  else if (resolveFailed) hint = "That location could not be loaded. Choose another suggestion.";
  else if (field.selected !== null) hint = "✓ Location selected";
  else if (result && "failed" in result) hint = "Location search failed. Check your connection.";
  else if (result && items.length === 0) hint = "No locations found. Try different words.";
  else if (query.length > 0) hint = "Choose a location from the suggestions.";
  else hint = "Type a place or address.";

  return (
    <div className={styles.endpoint}>
      <label htmlFor={`${id}-input`}>{label}</label>
      <input
        id={`${id}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        value={field.text}
        disabled={autocomplete.status === "unavailable"}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          setActive(0);
          setDismissed(null);
          setResolveFailed(false);
          onType(event.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`} hidden={!open}>
        {open &&
          items.map((item, index) => (
            <li
              key={item.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // Keep focus in the input, so the list does not close before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => void choose(item)}
            >
              <strong>{item.primary}</strong>
              {item.secondary && <span>{item.secondary}</span>}
            </li>
          ))}
      </ul>
      <p id={`${id}-hint`} className={styles.hint} role="status">
        {hint}
      </p>
    </div>
  );
}
