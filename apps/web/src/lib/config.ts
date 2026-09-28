/**
 * Google's documented placeholder map ID for development and testing.
 * Advanced Markers need some map ID. Set NEXT_PUBLIC_GOOGLE_MAP_ID to use your own.
 */
export const DEMO_MAP_ID = "DEMO_MAP_ID";

export type MapsConfig = {
  /** Null when no key is configured. The UI then shows setup instructions. */
  apiKey: string | null;
  mapId: string;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getMapsConfig(): MapsConfig {
  return {
    apiKey: clean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY),
    mapId: clean(process.env.NEXT_PUBLIC_GOOGLE_MAP_ID) ?? DEMO_MAP_ID,
  };
}

/** Where the map opens. Places themselves always come from the API. */
export const INITIAL_VIEW = {
  center: { lat: 42.3545, lng: -71.08 },
  zoom: 14,
} as const;

export const VIEWPORT_DEBOUNCE_MS = 350;

/** How long typing must pause before a search or year change is applied. */
export const SEARCH_DEBOUNCE_MS = 300;
