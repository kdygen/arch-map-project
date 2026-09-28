"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { type ReactNode, useMemo, useRef } from "react";

import { INITIAL_VIEW } from "@/lib/config";
import {
  type PlaceAutocomplete,
  PlaceAutocompleteContext,
  type Suggestion,
} from "@/lib/routing/autocomplete";
import type { Endpoint } from "@/lib/routing/types";

/** Suggestions lean toward this area but are not limited to it. */
const BIAS_RADIUS_METERS = 30_000;

/**
 * Location search backed by Places API (New), through the Maps JavaScript
 * API's AutocompleteSuggestion class. It must render inside APIProvider.
 *
 * One session token covers the typing and the final lookup of a choice,
 * which is how Google bills autocomplete as a single session.
 */
export function GoogleAutocompleteProvider({ children }: { children: ReactNode }) {
  const places = useMapsLibrary("places");
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const predictions = useRef(new Map<string, google.maps.places.PlacePrediction>());

  const value = useMemo<PlaceAutocomplete>(() => {
    if (places === null) return { status: "loading" };
    if (typeof places.AutocompleteSuggestion?.fetchAutocompleteSuggestions !== "function") {
      return { status: "unavailable" };
    }

    const suggest = async (input: string): Promise<Suggestion[]> => {
      session.current ??= new places.AutocompleteSessionToken();
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: session.current,
        locationBias: { center: INITIAL_VIEW.center, radius: BIAS_RADIUS_METERS },
      });

      predictions.current.clear();
      const results: Suggestion[] = [];
      for (const { placePrediction } of suggestions) {
        if (!placePrediction) continue;
        predictions.current.set(placePrediction.placeId, placePrediction);
        results.push({
          id: placePrediction.placeId,
          primary: placePrediction.mainText?.text ?? placePrediction.text.text,
          secondary: placePrediction.secondaryText?.text ?? "",
        });
      }
      return results;
    };

    const resolve = async (suggestion: Suggestion): Promise<Endpoint> => {
      const prediction = predictions.current.get(suggestion.id);
      if (!prediction) throw new Error("This suggestion is no longer available");
      const place = prediction.toPlace();
      // Only the location is requested. Nothing here feeds the architecture catalog.
      await place.fetchFields({ fields: ["location"] });
      // The lookup ends the billing session, so the next search starts a new one.
      session.current = null;
      if (!place.location) throw new Error("This place has no location");
      return {
        label: suggestion.primary,
        lat: place.location.lat(),
        lng: place.location.lng(),
        placeId: suggestion.id,
      };
    };

    return { status: "ready", suggest, resolve };
  }, [places]);

  return (
    <PlaceAutocompleteContext.Provider value={value}>{children}</PlaceAutocompleteContext.Provider>
  );
}
