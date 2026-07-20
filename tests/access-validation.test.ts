import { describe, it, expect } from "vitest";
import { grantAccessSchema } from "@/lib/validation/access";

const validGrant = {
  user_id: "10000005-0000-4000-8000-000000000005",
  project_id: "30000003-0000-4000-8000-000000000003",
  permission_keys: ["view_project", "view_budget"],
  expires_at: "2026-08-15",
};

describe("grantAccessSchema", () => {
  it("accepts a fully populated valid grant", () => {
    expect(grantAccessSchema.safeParse(validGrant).success).toBe(true);
  });

  it("accepts an omitted expires_at (permanent grant)", () => {
    expect(
      grantAccessSchema.safeParse({
        user_id: validGrant.user_id,
        project_id: validGrant.project_id,
        permission_keys: validGrant.permission_keys,
      }).success
    ).toBe(true);
  });

  it("collapses a blank expires_at to null", () => {
    const parsed = grantAccessSchema.safeParse({ ...validGrant, expires_at: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.expires_at).toBeNull();
  });

  it("collapses a null expires_at to null", () => {
    const parsed = grantAccessSchema.safeParse({ ...validGrant, expires_at: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.expires_at).toBeNull();
  });

  it("rejects a non-uuid user_id", () => {
    expect(grantAccessSchema.safeParse({ ...validGrant, user_id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a non-uuid project_id", () => {
    expect(grantAccessSchema.safeParse({ ...validGrant, project_id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an empty permission_keys array", () => {
    expect(grantAccessSchema.safeParse({ ...validGrant, permission_keys: [] }).success).toBe(false);
  });

  it("rejects a malformed expires_at", () => {
    expect(grantAccessSchema.safeParse({ ...validGrant, expires_at: "08/15/2026" }).success).toBe(false);
  });

  it("rejects a missing user_id", () => {
    expect(
      grantAccessSchema.safeParse({
        project_id: validGrant.project_id,
        permission_keys: validGrant.permission_keys,
        expires_at: validGrant.expires_at,
      }).success
    ).toBe(false);
  });

  it("rejects a missing project_id", () => {
    expect(
      grantAccessSchema.safeParse({
        user_id: validGrant.user_id,
        permission_keys: validGrant.permission_keys,
        expires_at: validGrant.expires_at,
      }).success
    ).toBe(false);
  });

  it("accepts a single-permission grant", () => {
    expect(
      grantAccessSchema.safeParse({ ...validGrant, permission_keys: ["reveal_credential"] }).success
    ).toBe(true);
  });
});
