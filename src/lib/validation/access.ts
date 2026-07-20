import { z } from "zod";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

// Permissions that must NEVER be handed out as an ad-hoc per-project grant
// (user_project_permissions): either self-escalation vectors -- manage_access grants the
// grantee the ability to grant anything, including manage_access itself, to anyone on that
// project, recursively -- or global-only permissions that are meaningless scoped to a single
// project. This list is the single source of truth for the client (form options) and the
// server (action-level reject); the real backstop is the DB trigger
// `user_project_permissions_grantable` (20260720000005_enforce_grantable_permission.sql), which
// enforces the same denylist for every caller, including a forced RLS insert.
export const NON_GRANTABLE_PERMISSIONS = [
  "manage_access",
  "manage_users",
  "view_audit",
  "create_project",
  "export_data",
  "reveal_credential",
] as const satisfies readonly Permission[];

export const GRANTABLE_PROJECT_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (key) => !(NON_GRANTABLE_PERMISSIONS as readonly string[]).includes(key),
);

export function isGrantablePermission(key: string): boolean {
  return !(NON_GRANTABLE_PERMISSIONS as readonly string[]).includes(key);
}

// expires_at is a single optional date -- unlike delegations (which pairs starts_at/ends_at and
// needs a strict ordering check), a grant only ever has one boundary, so a blank/omitted value
// just collapses to null ("granted indefinitely", matching the DB column's nullable expires_at).
const nullableIsoDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Enter a valid date",
  });

// Shapes a per-project ad-hoc permission grant (user_project_permissions: user + project +
// one-or-more permission keys + optional expiry). The DB's real backstop is the "managers insert
// project grants" RLS policy (has_permission(auth.uid(),'manage_access', project_id)) -- this
// schema only validates input shape, not who's allowed to grant what.
export const grantAccessSchema = z.object({
  user_id: z.uuid("Select a user"),
  project_id: z.uuid("Select a project"),
  permission_keys: z.array(z.string().min(1)).min(1, "Select at least one permission"),
  expires_at: nullableIsoDate,
});

export type GrantAccessInput = z.input<typeof grantAccessSchema>;
export type GrantAccessOutput = z.output<typeof grantAccessSchema>;
