import { type ReactNode, useEffect } from "react";
import { vi } from "vitest";

/**
 * A stand-in for @vis.gl/react-google-maps. Tests never load Google Maps
 * and never need an API key.
 */
type ProviderProps = { apiKey: string; onError?: (e: unknown) => void; children: ReactNode };
type MapProps = {
  mapId?: string;
  onBoundsChanged?: (event: { detail: { bounds: unknown } }) => void;
  onClick?: () => void;
  children?: ReactNode;
};
type MarkerProps = {
  title?: string;
  position: { lat: number; lng: number };
  onClick?: () => void;
  children?: ReactNode;
};

export const providerMounts = vi.fn();

export const stubState: {
  emitBounds: (bounds: { west: number; south: number; east: number; north: number }) => void;
  failToLoad: () => void;
} = { emitBounds: () => {}, failToLoad: () => {} };

export function APIProvider({ apiKey, onError, children }: ProviderProps) {
  useEffect(() => {
    providerMounts(apiKey);
  }, [apiKey]);
  useEffect(() => {
    stubState.failToLoad = () => onError?.(new Error("script failed"));
  }, [onError]);
  return <div data-testid="api-provider">{children}</div>;
}

export function Map({ mapId, onBoundsChanged, onClick, children }: MapProps) {
  useEffect(() => {
    stubState.emitBounds = (bounds) => onBoundsChanged?.({ detail: { bounds } });
  }, [onBoundsChanged]);
  return (
    <div data-testid="google-map" data-map-id={mapId}>
      <button type="button" onClick={onClick}>
        empty map area
      </button>
      {children}
    </div>
  );
}

export function AdvancedMarker({ title, position, onClick, children }: MarkerProps) {
  return (
    <button
      type="button"
      data-testid="marker"
      data-lat={position.lat}
      data-lng={position.lng}
      aria-label={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
