import { describe, it, expect } from "vitest";
import {
  utilizationClass,
  utilizationLabel,
  utilizationBadgeClasses,
  UTILIZATION_BADGE_CLASS,
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
