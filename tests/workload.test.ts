import { describe, it, expect } from "vitest";
import {
  utilizationClass,
  utilizationLabel,
  utilizationBadgeClasses,
  utilizationCellClasses,
  UTILIZATION_BADGE_CLASS,
  UTILIZATION_CELL_EMPTY_CLASS,
  weekStartsFrom,
} from "@/lib/workload";

describe("utilizationClass", () => {
  it("0% is available", () => {
    expect(utilizationClass(0)).toBe("available");
  });

  it("49% is available (upper boundary of available)", () => {
    expect(utilizationClass(49)).toBe("available");
  });

  it("50% is partial (lower boundary of partial)", () => {
    expect(utilizationClass(50)).toBe("partial");
  });

  it("89% is partial (upper boundary of partial)", () => {
    expect(utilizationClass(89)).toBe("partial");
  });

  it("90% is full (lower boundary of full)", () => {
    expect(utilizationClass(90)).toBe("full");
  });

  it("100% is full (upper boundary of full)", () => {
    expect(utilizationClass(100)).toBe("full");
  });

  it("101% is overallocated (just past full)", () => {
    expect(utilizationClass(101)).toBe("overallocated");
  });

  it("130% is overallocated", () => {
    expect(utilizationClass(130)).toBe("overallocated");
  });
});

describe("utilizationLabel", () => {
  it("labels each class", () => {
    expect(utilizationLabel(0)).toBe("Available");
    expect(utilizationLabel(60)).toBe("Partial");
    expect(utilizationLabel(95)).toBe("Full");
    expect(utilizationLabel(150)).toBe("Overallocated");
  });
});

describe("utilizationBadgeClasses", () => {
  it("returns a distinct class string per class", () => {
    const classes = [0, 60, 95, 150].map(utilizationBadgeClasses);
    expect(new Set(classes).size).toBe(4);
  });

  it("matches the exported class map", () => {
    expect(utilizationBadgeClasses(0)).toBe(UTILIZATION_BADGE_CLASS.available);
    expect(utilizationBadgeClasses(150)).toBe(UTILIZATION_BADGE_CLASS.overallocated);
  });
});

describe("utilizationCellClasses", () => {
  it("0% (free) is the distinct empty class, not the 'available' tint", () => {
    expect(utilizationCellClasses(0)).toBe(UTILIZATION_CELL_EMPTY_CLASS);
  });

  it("returns a distinct, non-empty class per non-zero class", () => {
    const classes = [30, 60, 95, 150].map(utilizationCellClasses);
    expect(new Set(classes).size).toBe(4);
    for (const c of classes) expect(c).not.toBe(UTILIZATION_CELL_EMPTY_CLASS);
  });
});

describe("weekStartsFrom", () => {
  it("anchors to the Monday of the given date's week", () => {
    // 2026-07-16 is a Thursday; the Monday of that week is 2026-07-13.
    const weeks = weekStartsFrom(new Date("2026-07-16T00:00:00Z"), 1);
    expect(weeks).toEqual(["2026-07-13"]);
  });

  it("anchors correctly when the given date is itself a Sunday", () => {
    // 2026-07-19 is a Sunday; its week's Monday is 2026-07-13 (not the following Monday).
    const weeks = weekStartsFrom(new Date("2026-07-19T00:00:00Z"), 1);
    expect(weeks).toEqual(["2026-07-13"]);
  });

  it("returns N consecutive Mondays 7 days apart", () => {
    const weeks = weekStartsFrom(new Date("2026-07-13T00:00:00Z"), 3);
    expect(weeks).toEqual(["2026-07-13", "2026-07-20", "2026-07-27"]);
  });

  it("clamps to at least 1 week", () => {
    expect(weekStartsFrom(new Date("2026-07-13T00:00:00Z"), 0)).toEqual(["2026-07-13"]);
  });
});
