"use client";

import { useCallback, useMemo, useState } from "react";

import { useFilterOptions } from "@/hooks/use-filter-options";
import { useFilters } from "@/hooks/use-filters";
import { usePlaceDetail } from "@/hooks/use-place-detail";
import { useViewportPlaces } from "@/hooks/use-viewport-places";
import type { PlaceSummary } from "@/lib/api/places";
import { type MapsConfig, SEARCH_DEBOUNCE_MS, VIEWPORT_DEBOUNCE_MS } from "@/lib/config";
import { EMPTY_FILTERS, type FilterState, hasAnyFilter } from "@/lib/filters/state";
import { formatYearBuilt } from "@/lib/format/place";
import type { Bounds } from "@/lib/geo/bounds";

import styles from "./explorer.module.css";
import { ActiveFilters } from "./filters/active-filters";
import { FilterPanel } from "./filters/filter-panel";
import { SearchBox } from "./filters/search-box";
import { MapView } from "./map/map-view";
import { PlaceDetails } from "./place/place-details";
import { PlacePreview } from "./place/place-preview";
import { ViewportStatus } from "./viewport-status";

type Props = {
  config: MapsConfig;
  initialFilters?: FilterState;
  debounceMs?: number;
  searchDebounceMs?: number;
  syncUrl?: boolean;
};

type Selection = { place: PlaceSummary; filterKey: string };

/** Connects search, filters, the map, and the selection. Holds no Google code. */
export function Explorer({
  config,
  initialFilters = EMPTY_FILTERS,
  debounceMs = VIEWPORT_DEBOUNCE_MS,
  searchDebounceMs = SEARCH_DEBOUNCE_MS,
  syncUrl = true,
}: Props) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const filters = useFilters(initialFilters, searchDebounceMs, syncUrl);
  const options = useFilterOptions();
  const viewport = useViewportPlaces(
    config.apiKey === null ? null : bounds,
    debounceMs,
    filters.viewport,
  );

  // A selection belongs to the filters it was made under. Changing the
  // filters clears it, so a place that no longer matches never stays selected.
  const selected =
    selection !== null && selection.filterKey === filters.viewport.key ? selection.place : null;
  const detail = usePlaceDetail(detailsOpen && selected ? selected.slug : null);

  const select = useCallback(
    (slug: string | null) => {
      setDetailsOpen(false);
      const place = slug === null ? undefined : viewport.places.find((p) => p.slug === slug);
      setSelection(place ? { place, filterKey: filters.viewport.key } : null);
    },
    [viewport.places, filters.viewport.key],
  );

  // The selected marker stays on the map even when it is outside the viewport.
  const markers = useMemo(() => {
    if (selected === null || viewport.places.some((p) => p.slug === selected.slug)) {
      return viewport.places;
    }
    return [...viewport.places, selected];
  }, [viewport.places, selected]);

  const { dispatch } = filters;
  const clearFilters = useCallback(() => dispatch({ type: "clearAll" }), [dispatch]);

  return (
    <div className={styles.explorer}>
      <aside className={styles.panel} aria-label="Explore places">
        <SearchBox q={filters.state.q} dispatch={filters.dispatch} />
        <ActiveFilters state={filters.state} dispatch={filters.dispatch} options={options} />

        {/* The result count stays near the top, above the long filter list. */}
        <ViewportStatus
          viewport={viewport}
          filtered={hasAnyFilter(filters.applied)}
          onClearFilters={clearFilters}
        />

        <FilterPanel state={filters.state} dispatch={filters.dispatch} options={options} />

        {selected === null && viewport.places.length > 0 && (
          <ul className={styles.list} aria-label="Places in this map area">
            {viewport.places.map((place) => (
              <li key={place.slug}>
                <button type="button" onClick={() => select(place.slug)}>
                  <strong>{place.name}</strong>
                  <span>
                    {[place.primary_style?.name, place.architects[0]?.name, formatYearBuilt(place)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected !== null && !detailsOpen && (
          <PlacePreview
            place={selected}
            onViewDetails={() => setDetailsOpen(true)}
            onClose={() => select(null)}
          />
        )}

        {selected !== null && detailsOpen && (
          <PlaceDetails
            key={selected.slug}
            name={selected.name}
            state={detail}
            onBack={() => setDetailsOpen(false)}
          />
        )}
      </aside>

      <section className={styles.mapArea} aria-label="Map">
        <MapView
          config={config}
          places={markers}
          selectedSlug={selected?.slug ?? null}
          onSelect={select}
          onBoundsChange={setBounds}
        />
      </section>
    </div>
  );
}
