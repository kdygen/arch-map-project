"use client";

import type { PlaceSummary } from "@/lib/api/places";

import { PlaceMarker } from "./place-marker";

type Props = {
  places: PlaceSummary[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
};

/**
 * The marker layer. Marker clustering for large datasets belongs here,
 * and nothing outside this component would need to change.
 */
export function PlaceMarkers({ places, selectedSlug, onSelect }: Props) {
  return places.map((place) => (
    <PlaceMarker
      key={place.slug}
      place={place}
      selected={place.slug === selectedSlug}
      onSelect={onSelect}
    />
  ));
}
