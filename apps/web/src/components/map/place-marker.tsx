"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";

import type { PlaceSummary } from "@/lib/api/places";

import styles from "./map.module.css";

type Props = {
  place: PlaceSummary;
  selected: boolean;
  onSelect: (slug: string) => void;
};

/**
 * One place on the map. Selection is shown by size, outline, and a name
 * label, so it never depends on color alone.
 */
export function PlaceMarker({ place, selected, onSelect }: Props) {
  return (
    <AdvancedMarker
      position={{ lat: place.latitude, lng: place.longitude }}
      title={selected ? `${place.name}, selected` : place.name}
      zIndex={selected ? 1000 : (place.significance_score ?? 0)}
      onClick={() => onSelect(place.slug)}
    >
      <div className={styles.marker} data-selected={selected}>
        {selected && <span className={styles.markerLabel}>{place.name}</span>}
        <span className={styles.markerPin} aria-hidden="true" />
      </div>
    </AdvancedMarker>
  );
}
