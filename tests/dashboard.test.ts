import { describe, it, expect } from "vitest";
import {
  daysUntil,
  isApproachingDeadline,
  isStaleStatus,
  monthKey,
  monthLabel,
  lastNMonthKeys,
} from "@/lib/dashboard";

const TODAY = new Date("2026-07-16T12:00:00Z");

describe("daysUntil", () => {
  it("is 0 for today", () => {
    expect(daysUntil("2026-07-16", TODAY)).toBe(0);
  });

  it("is positive for a future date", () => {
    expect(daysUntil("2026-07-30", TODAY)).toBe(14);
  });

  it("is negative for a past date", () => {
    expect(daysUntil("2026-07-01", TODAY)).toBe(-15);
  });
});

describe("isApproachingDeadline", () => {
  it("true for a deadline exactly 14 days out (inclusive boundary)", () => {
    expect(isApproachingDeadline("2026-07-30", 14, TODAY)).toBe(true);
  });

  it("false for a deadline 15 days out", () => {
    expect(isApproachingDeadline("2026-07-31", 14, TODAY)).toBe(false);
  });

  it("true for today's deadline", () => {
    expect(isApproachingDeadline("2026-07-16", 14, TODAY)).toBe(true);
  });

  it("false for an already-overdue deadline", () => {
    expect(isApproachingDeadline("2026-07-10", 14, TODAY)).toBe(false);
  });

  it("false for a null deadline", () => {
    expect(isApproachingDeadline(null, 14, TODAY)).toBe(false);
  });
});

describe("isStaleStatus", () => {
  it("false for an update from today", () => {
    expect(isStaleStatus("2026-07-16T09:00:00Z", 14, TODAY)).toBe(false);
  });

  it("false for an update exactly 14 days old (boundary)", () => {
    expect(isStaleStatus("2026-07-02T09:00:00Z", 14, TODAY)).toBe(false);
  });

  it("true for an update 15 days old", () => {
    expect(isStaleStatus("2026-07-01T09:00:00Z", 14, TODAY)).toBe(true);
  });

  it("true when there has never been a status update (null)", () => {
    expect(isStaleStatus(null, 14, TODAY)).toBe(true);
  });
});

describe("monthKey / monthLabel", () => {
  it("extracts YYYY-MM from an ISO date", () => {
    expect(monthKey("2026-07-16")).toBe("2026-07");
    expect(monthKey("2026-07-16T09:00:00Z")).toBe("2026-07");
  });

  it("formats a month key as a short label", () => {
    expect(monthLabel("2026-07")).toBe("Jul 2026");
  });
});

describe("lastNMonthKeys", () => {
  it("returns the last N months ending at `from`, oldest first", () => {
    expect(lastNMonthKeys(3, TODAY)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("rolls over a year boundary", () => {
    const jan = new Date("2026-01-15T00:00:00Z");
    expect(lastNMonthKeys(3, jan)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});
