import { z } from "zod";

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
