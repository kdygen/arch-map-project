import { createContext, useContext } from "react";

import type { Endpoint } from "./types";

/** One suggested location. `id` is only meaningful to the service that made it. */
export type Suggestion = {
  id: string;
  primary: string;
  secondary: string;
};

/**
 * Location search for choosing route endpoints. The interface has no Google
 * types, so the panel that uses it does not depend on the provider.
 *
 * It only finds points on the map. It is never a source of architecture facts.
 */
export type PlaceAutocomplete =
  | { status: "loading" }
  | { status: "unavailable" }
  | {
      status: "ready";
      suggest: (input: string) => Promise<Suggestion[]>;
      /** Turn a suggestion into coordinates. */
      resolve: (suggestion: Suggestion) => Promise<Endpoint>;
    };

export const PlaceAutocompleteContext = createContext<PlaceAutocomplete>({
  status: "unavailable",
});

export function usePlaceAutocomplete(): PlaceAutocomplete {
  return useContext(PlaceAutocompleteContext);
}

export const MIN_SUGGESTION_INPUT = 2;
export const SUGGESTION_DEBOUNCE_MS = 250;
