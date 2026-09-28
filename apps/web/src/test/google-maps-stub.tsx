import { type ReactNode, useEffect } from "react";
import { vi } from "vitest";

/**
 * A stand-in for @vis.gl/react-google-maps. Tests never load Google Maps,
 * never call Places, and never need an API key.
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
type PolylineProps = { path?: { lat: number; lng: number }[]; strokeWeight?: number };

export const providerMounts = vi.fn();
export const fitBounds = vi.fn();

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
  // Like the real thing, a marker without a click handler is not a button.
  if (!onClick) {
    return (
      <div
        data-testid="endpoint-marker"
        data-lat={position.lat}
        data-lng={position.lng}
        role="img"
        aria-label={title}
      >
        {children}
      </div>
    );
  }
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

export function Polyline({ path = [], strokeWeight }: PolylineProps) {
  return (
    <div
      data-testid="route-line"
      data-points={path.length}
      data-first={path[0] ? `${path[0].lat},${path[0].lng}` : ""}
      data-last={path.length ? `${path.at(-1)!.lat},${path.at(-1)!.lng}` : ""}
      data-weight={strokeWeight}
    />
  );
}

const fakeMap = { fitBounds };

export function useMap() {
  return fakeMap;
}

// ---- Places API (New) ----------------------------------------------------

export type FakePlace = { id: string; main: string; secondary: string; lat: number; lng: number };

export const placesStub: {
  available: boolean;
  /** Places returned for any input that one of their names starts with. */
  catalog: FakePlace[];
  inputs: string[];
  requests: { input: string; token: unknown; locationBias: unknown }[];
  lookups: { id: string; fields: string[] }[];
  tokens: number;
  failSuggest: boolean;
  failLookup: boolean;
} = {
  available: true,
  catalog: [],
  inputs: [],
  requests: [],
  lookups: [],
  tokens: 0,
  failSuggest: false,
  failLookup: false,
};

export function resetPlacesStub(catalog: FakePlace[] = []) {
  Object.assign(placesStub, {
    available: true,
    catalog,
    inputs: [],
    requests: [],
    lookups: [],
    tokens: 0,
    failSuggest: false,
    failLookup: false,
  });
}

class AutocompleteSessionToken {
  readonly number: number;
  constructor() {
    this.number = ++placesStub.tokens;
  }
}

const AutocompleteSuggestion = {
  async fetchAutocompleteSuggestions(request: {
    input: string;
    sessionToken: unknown;
    locationBias: unknown;
  }) {
    placesStub.inputs.push(request.input);
    placesStub.requests.push({
      input: request.input,
      token: request.sessionToken,
      locationBias: request.locationBias,
    });
    if (placesStub.failSuggest) throw new Error("Places API (New) is not enabled");
    const input = request.input.toLowerCase();
    const suggestions = placesStub.catalog
      .filter((place) => place.main.toLowerCase().includes(input))
      .map((place) => ({
        placePrediction: {
          placeId: place.id,
          text: { text: `${place.main}, ${place.secondary}` },
          mainText: { text: place.main },
          secondaryText: { text: place.secondary },
          toPlace: () => {
            const result: {
              location?: { lat: () => number; lng: () => number };
              fetchFields: (options: { fields: string[] }) => Promise<void>;
            } = {
              async fetchFields({ fields }) {
                placesStub.lookups.push({ id: place.id, fields });
                if (placesStub.failLookup) throw new Error("lookup failed");
                result.location = { lat: () => place.lat, lng: () => place.lng };
              },
            };
            return result;
          },
        },
      }));
    return { suggestions };
  },
};

const placesLibrary = { AutocompleteSuggestion, AutocompleteSessionToken };

export function useMapsLibrary(name: string) {
  if (name !== "places") return null;
  return placesStub.available ? placesLibrary : {};
}
