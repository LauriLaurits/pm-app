import { describe, it, expect } from "vitest";
import { timeOffSchema } from "@/lib/validation/time-off";

const validTimeOff = {
  starts_on: "2026-08-01",
  ends_on: "2026-08-05",
  type: "vacation" as const,
  note: "Summer trip",
};

describe("timeOffSchema", () => {
  it("accepts a fully populated valid period", () => {
    expect(timeOffSchema.safeParse(validTimeOff).success).toBe(true);
  });

  it("accepts a single-day period (ends_on === starts_on)", () => {
    expect(
      timeOffSchema.safeParse({ ...validTimeOff, ends_on: validTimeOff.starts_on }).success
    ).toBe(true);
  });

  it("rejects ends_on before starts_on", () => {
    const parsed = timeOffSchema.safeParse({
      ...validTimeOff,
      starts_on: "2026-08-05",
      ends_on: "2026-08-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("collapses a blank note to null", () => {
    const parsed = timeOffSchema.safeParse({ ...validTimeOff, note: "   " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBeNull();
  });

  it("allows an omitted/null note", () => {
    expect(timeOffSchema.safeParse({ ...validTimeOff, note: null }).success).toBe(true);
  });

  it("rejects a malformed starts_on/ends_on", () => {
    expect(
      timeOffSchema.safeParse({ ...validTimeOff, starts_on: "08/01/2026" }).success
    ).toBe(false);
    expect(timeOffSchema.safeParse({ ...validTimeOff, ends_on: "" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(timeOffSchema.safeParse({ ...validTimeOff, type: "pto" }).success).toBe(false);
  });
});
