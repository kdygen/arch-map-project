"use client";

import { useCallback, useMemo, useState } from "react";

import { usePlaceDetail } from "@/hooks/use-place-detail";
import { useViewportPlaces } from "@/hooks/use-viewport-places";
import type { PlaceSummary } from "@/lib/api/places";
import { type MapsConfig, VIEWPORT_DEBOUNCE_MS } from "@/lib/config";
import type { Bounds } from "@/lib/geo/bounds";

import styles from "./explorer.module.css";
import { MapView } from "./map/map-view";
import { PlaceDetails } from "./place/place-details";
import { PlacePreview } from "./place/place-preview";
import { ViewportStatus } from "./viewport-status";

type Props = {
  config: MapsConfig;
  debounceMs?: number;
};

/** Connects the map, the place data, and the selection. Holds no Google code. */
export function Explorer({ config, debounceMs = VIEWPORT_DEBOUNCE_MS }: Props) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  // The whole summary is kept, so a selection survives panning away from it.
  const [selected, setSelected] = useState<PlaceSummary | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const viewport = useViewportPlaces(bounds, debounceMs);
  const detail = usePlaceDetail(detailsOpen && selected ? selected.slug : null);

  const select = useCallback(
    (slug: string | null) => {
      setDetailsOpen(false);
      setSelected(slug === null ? null : (viewport.places.find((p) => p.slug === slug) ?? null));
    },
    [viewport.places],
  );

  // The selected marker stays on the map even when it is outside the viewport.
  const markers = useMemo(() => {
    if (selected === null || viewport.places.some((p) => p.slug === selected.slug)) {
      return viewport.places;
    }
    return [...viewport.places, selected];
  }, [viewport.places, selected]);

  return (
    <div className={styles.explorer}>
      <section className={styles.mapArea} aria-label="Map">
        <MapView
          config={config}
          places={markers}
          selectedSlug={selected?.slug ?? null}
          onSelect={select}
          onBoundsChange={setBounds}
        />
      </section>

      <aside className={styles.panel} aria-label="Places">
        <ViewportStatus viewport={viewport} />

        {selected === null && viewport.places.length > 0 && (
          <>
            <p className={styles.hint}>Select a place on the map or from this list.</p>
            <ul className={styles.list}>
              {viewport.places.map((place) => (
                <li key={place.slug}>
                  <button type="button" onClick={() => select(place.slug)}>
                    <strong>{place.name}</strong>
                    <span>
                      {[place.primary_style?.name, place.architects[0]?.name]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
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
    </div>
  );
}
