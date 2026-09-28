"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { type ReactNode, useEffect, useState } from "react";

import type { MapsConfig } from "@/lib/config";

import { GoogleAutocompleteProvider } from "./google-autocomplete";
import type { MapProblem } from "./map-notice";
import { MapsProblemContext } from "./maps-context";

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

/**
 * Loads Google Maps once for everything below it: the map and the location
 * search. Without a key nothing is loaded, and both explain what is missing.
 */
export function MapsProvider({ config, children }: { config: MapsConfig; children: ReactNode }) {
  const [failure, setFailure] = useState<MapProblem | null>(null);

  useEffect(() => {
    // Google calls this global when it rejects the key.
    window.gm_authFailure = () => setFailure("auth-failed");
    return () => {
      delete window.gm_authFailure;
    };
  }, []);

  if (config.apiKey === null) {
    return (
      <MapsProblemContext.Provider value="missing-key">{children}</MapsProblemContext.Provider>
    );
  }

  return (
    <MapsProblemContext.Provider value={failure}>
      <APIProvider apiKey={config.apiKey} onError={() => setFailure("load-failed")}>
        <GoogleAutocompleteProvider>{children}</GoogleAutocompleteProvider>
      </APIProvider>
    </MapsProblemContext.Provider>
  );
}
