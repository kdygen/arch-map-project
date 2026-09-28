"use client";

import { APIProvider, Map, type MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useState } from "react";

import type { PlaceSummary } from "@/lib/api/places";
import { INITIAL_VIEW, type MapsConfig } from "@/lib/config";
import type { Bounds } from "@/lib/geo/bounds";

import styles from "./map.module.css";
import { MapNotice, type MapProblem } from "./map-notice";
import { PlaceMarkers } from "./place-markers";

export type MapViewProps = {
  config: MapsConfig;
  places: PlaceSummary[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
};

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

/**
 * The only component that knows about Google Maps. It receives plain places
 * and reports plain bounds, so the provider can be replaced without touching
 * the rest of the app.
 */
export function MapView({ config, places, selectedSlug, onSelect, onBoundsChange }: MapViewProps) {
  const [problem, setProblem] = useState<MapProblem | null>(null);

  useEffect(() => {
    // Google calls this global when it rejects the key.
    window.gm_authFailure = () => setProblem("auth-failed");
    return () => {
      delete window.gm_authFailure;
    };
  }, []);

  const handleBounds = useCallback(
    (event: MapCameraChangedEvent) => {
      const { west, south, east, north } = event.detail.bounds;
      onBoundsChange({ west, south, east, north });
    },
    [onBoundsChange],
  );

  if (config.apiKey === null) return <MapNotice problem="missing-key" />;
  if (problem !== null) return <MapNotice problem={problem} />;

  return (
    // APIProvider loads the Maps script once, however often this renders.
    <APIProvider apiKey={config.apiKey} onError={() => setProblem("load-failed")}>
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
          <PlaceMarkers places={places} selectedSlug={selectedSlug} onSelect={onSelect} />
        </Map>
      </div>
    </APIProvider>
  );
}
