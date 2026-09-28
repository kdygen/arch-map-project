"use client";

import { Map, type MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { useCallback } from "react";

import type { PlaceSummary } from "@/lib/api/places";
import { INITIAL_VIEW, type MapsConfig } from "@/lib/config";
import type { Bounds } from "@/lib/geo/bounds";
import type { Route } from "@/lib/routing/types";

import styles from "./map.module.css";
import { MapNotice } from "./map-notice";
import { useMapsProblem } from "./maps-context";
import { PlaceMarkers } from "./place-markers";
import { RouteLayer } from "./route-layer";

export type MapViewProps = {
  config: MapsConfig;
  places: PlaceSummary[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
  /** The route to draw, if any. */
  route?: Route | null;
};

/**
 * The map itself. Together with the other files in this folder it is the only
 * code that knows about Google Maps. It receives plain places and reports
 * plain bounds. It must render inside MapsProvider.
 */
export function MapView({
  config,
  places,
  selectedSlug,
  onSelect,
  onBoundsChange,
  route = null,
}: MapViewProps) {
  const problem = useMapsProblem();

  const handleBounds = useCallback(
    (event: MapCameraChangedEvent) => {
      const { west, south, east, north } = event.detail.bounds;
      onBoundsChange({ west, south, east, north });
    },
    [onBoundsChange],
  );

  if (problem !== null) return <MapNotice problem={problem} />;

  return (
    <div className={styles.map} role="region" aria-label="Map of architecture locations">
      <Map
        mapId={config.mapId}
        defaultCenter={INITIAL_VIEW.center}
        defaultZoom={INITIAL_VIEW.zoom}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        clickableIcons={false}
        onBoundsChanged={handleBounds}
        onClick={() => onSelect(null)}
      >
        {route && <RouteLayer route={route} />}
        <PlaceMarkers places={places} selectedSlug={selectedSlug} onSelect={onSelect} />
      </Map>
    </div>
  );
}
