import { describe, it, expect } from "vitest";
import { timeEntrySchema } from "@/lib/validation/time-entry";

const validEntry = {
  project_id: "50000001-0000-4000-8000-000000000001",
  project_part_id: null,
  entry_date: "2026-07-16",
  hours: 4,
  billable: true,
  description: "Implemented the login flow.",
};

describe("timeEntrySchema", () => {
  it("accepts a fully populated valid entry", () => {
    expect(timeEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it("accepts an optional part id and optional description", () => {
    const parsed = timeEntrySchema.safeParse({
      ...validEntry,
      project_part_id: "50000002-0000-4000-8000-000000000002",
      description: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("collapses a blank description to null", () => {
    const parsed = timeEntrySchema.safeParse({ ...validEntry, description: "   " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.description).toBeNull();
  });

  it("rejects a non-uuid project_id", () => {
    expect(
      timeEntrySchema.safeParse({ ...validEntry, project_id: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("rejects a non-uuid project_part_id", () => {
    expect(
      timeEntrySchema.safeParse({ ...validEntry, project_part_id: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("rejects hours of exactly 0", () => {
    expect(timeEntrySchema.safeParse({ ...validEntry, hours: 0 }).success).toBe(false);
  });

  it("rejects negative hours", () => {
    expect(timeEntrySchema.safeParse({ ...validEntry, hours: -2 }).success).toBe(false);
  });

  it("accepts hours at the 24 boundary", () => {
    expect(timeEntrySchema.safeParse({ ...validEntry, hours: 24 }).success).toBe(true);
  });

  it("rejects hours above 24", () => {
    expect(timeEntrySchema.safeParse({ ...validEntry, hours: 24.01 }).success).toBe(false);
  });

  it("rejects a malformed entry_date", () => {
    expect(
      timeEntrySchema.safeParse({ ...validEntry, entry_date: "07/16/2026" }).success
    ).toBe(false);
    expect(
      timeEntrySchema.safeParse({ ...validEntry, entry_date: "" }).success
    ).toBe(false);
  });

  it("requires billable to be a boolean", () => {
    expect(
      timeEntrySchema.safeParse({ ...validEntry, billable: "yes" }).success
    ).toBe(false);
  });

  it("never accepts a person_id override (field is not part of the schema)", () => {
    const parsed = timeEntrySchema.safeParse({
      ...validEntry,
      person_id: "00000000-0000-4000-8000-000000000099",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).person_id).toBeUndefined();
    }
  });
});
