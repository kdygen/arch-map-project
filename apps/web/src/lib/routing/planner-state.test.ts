import { describe, expect, it } from "vitest";

import { EMPTY_PLANNER, plannerProblem, plannerReducer, type PlannerState } from "./planner-state";

const mit = { label: "MIT", lat: 42.3601, lng: -71.0942, placeId: "mit" };
const common = { label: "Boston Common", lat: 42.355, lng: -71.0655, placeId: "common" };

const both: PlannerState = {
  from: { text: "MIT", selected: mit },
  to: { text: "Boston Common", selected: common },
  mode: "walking",
};

describe("plannerReducer", () => {
  it("stores typed text without a selection", () => {
    const state = plannerReducer(EMPTY_PLANNER, { type: "type", which: "from", text: "MI" });

    expect(state.from).toEqual({ text: "MI", selected: null });
  });

  it("stores a chosen place with its coordinates and shows its label", () => {
    const state = plannerReducer(EMPTY_PLANNER, { type: "select", which: "to", endpoint: common });

    expect(state.to).toEqual({ text: "Boston Common", selected: common });
  });

  it.each(["MIT ", "MI", "MIT Museum", ""])(
    "drops the chosen place when the text is edited to %j",
    (text) => {
      const state = plannerReducer(both, { type: "type", which: "from", text });

      expect(state.from.selected).toBeNull();
      expect(state.to.selected).toEqual(common);
    },
  );

  it("keeps the chosen place when the text did not change", () => {
    expect(plannerReducer(both, { type: "type", which: "from", text: "MIT" })).toBe(both);
  });

  it("swaps text and places together", () => {
    const state = plannerReducer(both, { type: "swap" });

    expect(state.from).toEqual(both.to);
    expect(state.to).toEqual(both.from);
  });

  it("swaps a half-typed field too", () => {
    const partial: PlannerState = {
      from: both.from,
      to: { text: "Bos", selected: null },
      mode: "driving",
    };

    expect(plannerReducer(partial, { type: "swap" })).toEqual({
      from: { text: "Bos", selected: null },
      to: both.from,
      mode: "driving",
    });
  });

  it("starts with walking", () => {
    expect(EMPTY_PLANNER.mode).toBe("walking");
  });

  it("changes the travel mode and keeps the chosen places", () => {
    const state = plannerReducer(both, { type: "setMode", mode: "driving" });

    expect(state.mode).toBe("driving");
    expect(state.from).toBe(both.from);
    expect(state.to).toBe(both.to);
  });

  it("returns the same state when the mode does not change", () => {
    expect(plannerReducer(both, { type: "setMode", mode: "walking" })).toBe(both);
  });

  it("resets", () => {
    expect(plannerReducer(both, { type: "reset" })).toEqual(EMPTY_PLANNER);
  });
});

describe("plannerProblem", () => {
  it("is incomplete until both places are chosen", () => {
    expect(plannerProblem(EMPTY_PLANNER)).toBe("incomplete");
    expect(plannerProblem({ ...both, to: { text: "Boston Common", selected: null } })).toBe(
      "incomplete",
    );
  });

  it("rejects the same place twice", () => {
    expect(plannerProblem({ ...both, to: both.from })).toBe("same-place");
  });

  it("is fine with two different chosen places", () => {
    expect(plannerProblem(both)).toBeNull();
  });
});
