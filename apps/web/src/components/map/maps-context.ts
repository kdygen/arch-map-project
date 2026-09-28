import { createContext, useContext } from "react";

import type { MapProblem } from "./map-notice";

/** Why Google Maps cannot be used, or null when it can. */
export const MapsProblemContext = createContext<MapProblem | null>(null);

export function useMapsProblem(): MapProblem | null {
  return useContext(MapsProblemContext);
}
