import { describe, expect, it } from "vitest";

import { makeDetail } from "@/test/fixtures";

import {
  formatAccessibility,
  formatAdmission,
  formatArchitects,
  formatMinutes,
  formatPublicAccess,
  formatTime,
  formatYearBuilt,
  formatYesNoUnknown,
  groupOpeningHours,
  groupSources,
  safeExternalUrl,
} from "./place";

const year = (start: number | null, end: number | null, approximate = false) => ({
  year_built_start: start,
  year_built_end: end,
  year_is_approximate: approximate,
});

describe("formatYearBuilt", () => {
  it.each([
    [year(1955, null), "1955"],
    [year(1795, 1798), "1795–1798"],
    [year(1900, 1900), "1900"],
    [year(1850, null, true), "c. 1850"],
    [year(1850, 1860, true), "c. 1850–1860"],
    [year(null, null), null],
  ])("formats %o as %s", (input, expected) => {
    expect(formatYearBuilt(input)).toBe(expected);
  });
});

describe("labels", () => {
  it("describes access in words", () => {
    expect(formatPublicAccess("exterior_only")).toBe("Exterior viewing only");
    expect(formatPublicAccess("unknown")).toBe("Public access not confirmed");
  });

  it("describes admission in words", () => {
    expect(formatAdmission("free")).toBe("Free admission");
    expect(formatAdmission("unknown")).toBe("Admission not confirmed");
  });

  it("does not present an unknown value as a no", () => {
    expect(formatYesNoUnknown(null)).toBe("Not confirmed");
    expect(formatYesNoUnknown(false)).toBe("No");
    expect(formatYesNoUnknown(true)).toBe("Yes");
  });
});

describe("formatArchitects", () => {
  const architects = [
    { name: "A. One", role: "architect" },
    { name: "B. Two", role: "interior decoration" },
  ];

  it("lists names", () => {
    expect(formatArchitects(architects)).toBe("A. One, B. Two");
  });

  it("adds roles other than plain architect when asked", () => {
    expect(formatArchitects(architects, true)).toBe("A. One, B. Two (interior decoration)");
  });

  it("returns null when there are none", () => {
    expect(formatArchitects([])).toBeNull();
  });
});

describe("formatMinutes", () => {
  it.each([
    [10, "10 min"],
    [60, "1 hr"],
    [75, "1 hr 15 min"],
    [120, "2 hr"],
  ])("formats %i as %s", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});

describe("formatTime", () => {
  it.each([
    ["10:00:00", "10:00 AM"],
    ["13:30:00", "1:30 PM"],
    ["00:15:00", "12:15 AM"],
    ["12:00", "12:00 PM"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatTime(value)).toBe(expected);
  });

  it("returns unexpected input unchanged", () => {
    expect(formatTime("noon")).toBe("noon");
  });
});

describe("groupOpeningHours", () => {
  it("groups intervals by day, Monday first", () => {
    expect(groupOpeningHours(makeDetail().opening_hours)).toEqual([
      { day: "Monday", intervals: ["10:00 AM – 12:00 PM", "1:00 PM – 5:00 PM"] },
      { day: "Wednesday", intervals: ["10:00 AM – 5:00 PM"] },
    ]);
  });

  it("returns nothing when no hours are known", () => {
    expect(groupOpeningHours([])).toEqual([]);
  });
});

describe("groupSources", () => {
  it("lists each source once with the readable facts it supports", () => {
    expect(groupSources(makeDetail().field_sources)).toEqual([
      {
        url: "https://example.org/reference",
        title: "Example reference",
        publisher: "Example Org",
        supports: ["construction date", "architects"],
      },
    ]);
  });
});

describe("formatAccessibility", () => {
  it("turns stored flags into readable rows", () => {
    expect(formatAccessibility({ elevator: false, step_free_entrance: true })).toEqual([
      { label: "Elevator", value: "No" },
      { label: "Step free entrance", value: "Yes" },
    ]);
  });

  it("skips values it cannot show plainly", () => {
    expect(formatAccessibility({ nested: { a: 1 }, nothing: null })).toEqual([]);
    expect(formatAccessibility(null)).toEqual([]);
  });
});

describe("safeExternalUrl", () => {
  it("allows web links", () => {
    expect(safeExternalUrl("https://example.org/a")).toBe("https://example.org/a");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "not a url", "", null])(
    "rejects %j",
    (value) => {
      expect(safeExternalUrl(value)).toBeNull();
    },
  );
});
