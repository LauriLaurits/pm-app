import { describe, it, expect } from "vitest";
import { createDelegationSchema } from "@/lib/validation/delegation";

const validDelegation = {
  to_user: "10000005-0000-4000-8000-000000000005",
  project_ids: ["30000003-0000-4000-8000-000000000003"],
  permission_keys: ["view_project", "edit_status"],
  starts_at: "2026-08-01",
  ends_at: "2026-08-15",
  handover_notes: "Cover the regulator demo prep.",
};

describe("createDelegationSchema", () => {
  it("accepts a fully populated valid delegation", () => {
    expect(createDelegationSchema.safeParse(validDelegation).success).toBe(true);
  });

  it("rejects a non-uuid to_user", () => {
    expect(
      createDelegationSchema.safeParse({ ...validDelegation, to_user: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("rejects an empty project_ids array", () => {
    expect(
      createDelegationSchema.safeParse({ ...validDelegation, project_ids: [] }).success
    ).toBe(false);
  });

  it("rejects an empty permission_keys array", () => {
    expect(
      createDelegationSchema.safeParse({ ...validDelegation, permission_keys: [] }).success
    ).toBe(false);
  });

  it("rejects a non-uuid project id", () => {
    expect(
      createDelegationSchema.safeParse({ ...validDelegation, project_ids: ["nope"] }).success
    ).toBe(false);
  });

  it("rejects ends_at equal to starts_at (DB requires strictly after)", () => {
    const parsed = createDelegationSchema.safeParse({
      ...validDelegation,
      ends_at: validDelegation.starts_at,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects ends_at before starts_at", () => {
    expect(
      createDelegationSchema.safeParse({
        ...validDelegation,
        starts_at: "2026-08-15",
        ends_at: "2026-08-01",
      }).success
    ).toBe(false);
  });

  it("collapses a blank handover_notes to null", () => {
    const parsed = createDelegationSchema.safeParse({ ...validDelegation, handover_notes: "   " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.handover_notes).toBeNull();
  });

  it("allows an omitted/null handover_notes", () => {
    expect(
      createDelegationSchema.safeParse({ ...validDelegation, handover_notes: null }).success
    ).toBe(true);
  });

  it("rejects a malformed starts_at/ends_at", () => {
    expect(
      createDelegationSchema.safeParse({ ...validDelegation, starts_at: "08/01/2026" }).success
    ).toBe(false);
  });
});
