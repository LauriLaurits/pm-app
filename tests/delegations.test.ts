import { describe, it, expect } from "vitest";
import { classifyDelegation } from "@/lib/delegations";

const now = new Date("2026-07-20T12:00:00Z");

describe("classifyDelegation", () => {
  it("classifies a window that has started and not yet ended as active", () => {
    expect(
      classifyDelegation(
        { starts_at: "2026-07-17T00:00:00Z", ends_at: "2026-07-31T00:00:00Z", revoked_at: null },
        now
      )
    ).toBe("active");
  });

  it("classifies a future window as upcoming", () => {
    expect(
      classifyDelegation(
        { starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-08-15T00:00:00Z", revoked_at: null },
        now
      )
    ).toBe("upcoming");
  });

  it("classifies an elapsed window as past", () => {
    expect(
      classifyDelegation(
        { starts_at: "2026-06-01T00:00:00Z", ends_at: "2026-06-15T00:00:00Z", revoked_at: null },
        now
      )
    ).toBe("past");
  });

  it("classifies a revoked delegation as past even mid-window", () => {
    expect(
      classifyDelegation(
        {
          starts_at: "2026-07-01T00:00:00Z",
          ends_at: "2026-07-31T00:00:00Z",
          revoked_at: "2026-07-20T11:00:00Z",
        },
        now
      )
    ).toBe("past");
  });

  it("treats the exact start instant as active (now >= starts_at)", () => {
    expect(
      classifyDelegation(
        { starts_at: now.toISOString(), ends_at: "2026-07-31T00:00:00Z", revoked_at: null },
        now
      )
    ).toBe("active");
  });

  it("treats the exact end instant as past (now < ends_at is the live boundary)", () => {
    expect(
      classifyDelegation(
        { starts_at: "2026-07-01T00:00:00Z", ends_at: now.toISOString(), revoked_at: null },
        now
      )
    ).toBe("past");
  });
});
