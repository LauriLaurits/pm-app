import { describe, it, expect } from "vitest";
import { PERMISSIONS, isPermission } from "@/lib/auth/permissions";

describe("permission catalog", () => {
  it("contains the spec's core keys", () => {
    for (const k of [
      "view_project","edit_project","view_budget","view_internal_cost",
      "view_credentials","reveal_credential","manage_access","view_audit",
      "export_data","manage_users",
    ]) {
      expect(PERMISSIONS).toContain(k);
    }
  });
  it("isPermission narrows correctly", () => {
    expect(isPermission("view_budget")).toBe(true);
    expect(isPermission("hack_the_planet")).toBe(false);
  });
});
