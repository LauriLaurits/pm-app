import { describe, expect, it } from "vitest";
import { formatWeekLabel, isoWeekNumber, weekEndISO } from "@/app/(app)/workload/types";

describe("isoWeekNumber", () => {
  it("computes ISO week numbers (2026: Jan 1 is a Thursday, so W1 holds it)", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2025-12-29")).toBe(1); // Monday of 2026-W1
  });

  it("mid-year Monday", () => {
    expect(isoWeekNumber("2026-07-27")).toBe(31);
  });

  it("53-week year end", () => {
    expect(isoWeekNumber("2026-12-28")).toBe(53);
  });
});

describe("week helpers", () => {
  it("weekEndISO is the Sunday six days later", () => {
    expect(weekEndISO("2026-07-27")).toBe("2026-08-02");
  });

  it("formatWeekLabel is day-first", () => {
    expect(formatWeekLabel("2026-07-27")).toBe("27 Jul");
  });
});
