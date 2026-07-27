import { describe, expect, it } from "vitest";
import { formatShortDate } from "@/app/(app)/people/types";

describe("formatShortDate", () => {
  it("formats an ISO date as day + short month", () => {
    expect(formatShortDate("2026-08-03")).toBe("3 Aug");
  });

  it("keeps single-digit days unpadded", () => {
    expect(formatShortDate("2026-12-09")).toBe("9 Dec");
  });
});
