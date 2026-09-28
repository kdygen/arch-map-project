import { DEFAULT_TRAVEL_MODE, type Endpoint, type TravelMode } from "./types";

export type EndpointField = {
  /** What the input shows. */
  text: string;
  /** Set only while `text` is exactly the label of a chosen suggestion. */
  selected: Endpoint | null;
};

export type PlannerState = { from: EndpointField; to: EndpointField; mode: TravelMode };
export type Which = "from" | "to";

export const EMPTY_FIELD: EndpointField = { text: "", selected: null };
export const EMPTY_PLANNER: PlannerState = {
  from: EMPTY_FIELD,
  to: EMPTY_FIELD,
  mode: DEFAULT_TRAVEL_MODE,
};

export type PlannerAction =
  | { type: "type"; which: Which; text: string }
  | { type: "select"; which: Which; endpoint: Endpoint }
  | { type: "swap" }
  | { type: "setMode"; mode: TravelMode }
  | { type: "reset" };

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case "type": {
      const field = state[action.which];
      if (field.text === action.text) return state;
      // Editing the text drops the chosen place, so we never route from
      // coordinates that no longer match what the input says.
      return { ...state, [action.which]: { text: action.text, selected: null } };
    }
    case "select":
      return {
        ...state,
        [action.which]: { text: action.endpoint.label, selected: action.endpoint },
      };
    case "swap":
      return { ...state, from: state.to, to: state.from };
    case "setMode":
      return state.mode === action.mode ? state : { ...state, mode: action.mode };
    case "reset":
      return EMPTY_PLANNER;
  }
}

export type PlannerProblem = "incomplete" | "same-place" | null;

export function plannerProblem(state: PlannerState): PlannerProblem {
  const { selected: from } = state.from;
  const { selected: to } = state.to;
  if (from === null || to === null) return "incomplete";
  if (from.lat === to.lat && from.lng === to.lng) return "same-place";
  return null;
}
