"use client";

import { useCallback, useMemo, useReducer, useState } from "react";

import { useFilterOptions } from "@/hooks/use-filter-options";
import { useFilters } from "@/hooks/use-filters";
import { usePlaceDetail } from "@/hooks/use-place-detail";
import { useRoute } from "@/hooks/use-route";
import { useRoutePlaces } from "@/hooks/use-route-places";
import { useViewportPlaces } from "@/hooks/use-viewport-places";
import type { PlaceSummary } from "@/lib/api/places";
import { type MapsConfig, SEARCH_DEBOUNCE_MS, VIEWPORT_DEBOUNCE_MS } from "@/lib/config";
import { EMPTY_FILTERS, type FilterState, hasAnyFilter } from "@/lib/filters/state";
import { formatYearBuilt } from "@/lib/format/place";
import type { Bounds } from "@/lib/geo/bounds";
import { usePlaceAutocomplete } from "@/lib/routing/autocomplete";
import { EMPTY_PLANNER, plannerReducer } from "@/lib/routing/planner-state";

import styles from "./explorer.module.css";
import { ActiveFilters } from "./filters/active-filters";
import { FilterPanel } from "./filters/filter-panel";
import { SearchBox } from "./filters/search-box";
import { MapView } from "./map/map-view";
import { MapsProvider } from "./map/maps-provider";
import { PlaceDetails } from "./place/place-details";
import { PlacePreview } from "./place/place-preview";
import { RoutePanel } from "./route/route-panel";
import { RouteResults } from "./route/route-results";
import { ViewportStatus } from "./viewport-status";

type Props = {
  config: MapsConfig;
  initialFilters?: FilterState;
  debounceMs?: number;
  searchDebounceMs?: number;
  suggestionDebounceMs?: number;
  syncUrl?: boolean;
};

type Mode = "explore" | "route";
type Selection = { place: PlaceSummary; filterKey: string };

export function Explorer(props: Props) {
  return (
    <MapsProvider config={props.config}>
      <ExplorerContent {...props} />
    </MapsProvider>
  );
}

/** Connects search, filters, routing, the map, and the selection. Holds no Google code. */
function ExplorerContent({
  config,
  initialFilters = EMPTY_FILTERS,
  debounceMs = VIEWPORT_DEBOUNCE_MS,
  searchDebounceMs = SEARCH_DEBOUNCE_MS,
  suggestionDebounceMs,
  syncUrl = true,
}: Props) {
  const [mode, setMode] = useState<Mode>("explore");
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [planner, dispatchPlanner] = useReducer(plannerReducer, EMPTY_PLANNER);

  const filters = useFilters(initialFilters, searchDebounceMs, syncUrl);
  const options = useFilterOptions();
  const autocomplete = usePlaceAutocomplete();
  const route = useRoute();

  // A route is only shown in Route mode. Switching to Explore hides it but
  // keeps it, so coming back costs no new request.
  const activeRoute = mode === "route" && route.state.status === "ready" ? route.state.route : null;

  const viewport = useViewportPlaces(
    config.apiKey === null || activeRoute !== null ? null : bounds,
    debounceMs,
    filters.viewport,
  );
  const routePlaces = useRoutePlaces(activeRoute?.polyline ?? null, filters.viewport);

  // With a route, the places are the ones near it. Otherwise, the ones in view.
  const places = useMemo<PlaceSummary[]>(() => {
    if (activeRoute === null) return viewport.places;
    const result =
      routePlaces.status === "ready"
        ? routePlaces.result
        : routePlaces.status === "loading"
          ? routePlaces.previous
          : null;
    return result?.items.map((item) => item.place) ?? [];
  }, [activeRoute, viewport.places, routePlaces]);

  // A selection belongs to the filters it was made under. Changing the
  // filters clears it, so a place that no longer matches never stays selected.
  const selected =
    selection !== null && selection.filterKey === filters.viewport.key ? selection.place : null;
  const detail = usePlaceDetail(detailsOpen && selected ? selected.slug : null);

  const select = useCallback(
    (slug: string | null) => {
      setDetailsOpen(false);
      const place = slug === null ? undefined : places.find((p) => p.slug === slug);
      setSelection(place ? { place, filterKey: filters.viewport.key } : null);
    },
    [places, filters.viewport.key],
  );

  const changeMode = useCallback((next: Mode) => {
    setMode(next);
    setSelection(null);
    setDetailsOpen(false);
  }, []);

  // The selected marker stays on the map even when it is outside the list.
  const markers = useMemo(() => {
    if (selected === null || places.some((p) => p.slug === selected.slug)) return places;
    return [...places, selected];
  }, [places, selected]);

  const { dispatch } = filters;
  const clearFilters = useCallback(() => dispatch({ type: "clearAll" }), [dispatch]);
  const filtered = hasAnyFilter(filters.applied);

  return (
    <div className={styles.explorer}>
      <aside className={styles.panel} aria-label="Explore places">
        <div className={styles.modes} role="group" aria-label="What to do">
          <button
            type="button"
            aria-pressed={mode === "explore"}
            onClick={() => changeMode("explore")}
          >
            Explore
          </button>
          <button type="button" aria-pressed={mode === "route"} onClick={() => changeMode("route")}>
            Route
          </button>
        </div>

        {mode === "route" && (
          <RoutePanel
            planner={planner}
            dispatch={dispatchPlanner}
            route={route}
            autocomplete={autocomplete}
            suggestionDebounceMs={suggestionDebounceMs}
          />
        )}

        {/* This searches our architecture catalog. It never changes From or To. */}
        <SearchBox
          q={filters.state.q}
          dispatch={filters.dispatch}
          label={mode === "route" ? "Filter architecture by name, architect, or style" : undefined}
        />
        <ActiveFilters state={filters.state} dispatch={filters.dispatch} options={options} />

        {activeRoute === null && (
          <ViewportStatus viewport={viewport} filtered={filtered} onClearFilters={clearFilters} />
        )}

        <FilterPanel state={filters.state} dispatch={filters.dispatch} options={options} />

        {selected === null && activeRoute !== null && (
          <RouteResults
            state={routePlaces}
            filtered={filtered}
            selectedSlug={null}
            onSelect={select}
            onClearFilters={clearFilters}
          />
        )}

        {selected === null && activeRoute === null && viewport.places.length > 0 && (
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
          route={activeRoute}
        />
      </section>
    </div>
  );
}
