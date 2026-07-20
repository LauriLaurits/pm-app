import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** Blank/whitespace-only notes collapse to null so the DB never stores "". */
const nullableNote = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

// DB check: `ends_at > starts_at`, STRICT (20260715000006_credentials_delegations.sql) -- unlike
// time_off's `ends_on >= starts_on`, a delegation may not start and end on the same day. project_ids
// and permission_keys each require at least one entry: a delegation covering nothing is meaningless.
// The DB triggers (enforce_delegatable_permission, validate_delegation_project) are the real
// backstop for "only delegatable permissions" / "only the delegator's own projects" -- this schema
// only shapes the input, it can't know what the caller owns.
export const createDelegationSchema = z
  .object({
    to_user: z.uuid("Select a person"),
    project_ids: z.array(z.uuid()).min(1, "Select at least one project"),
    permission_keys: z.array(z.string().min(1)).min(1, "Select at least one permission"),
    starts_at: isoDate,
    ends_at: isoDate,
    handover_notes: nullableNote,
  })
  .refine((data) => data.ends_at > data.starts_at, {
    message: "End date must be after the start date",
    path: ["ends_at"],
  });

export type CreateDelegationInput = z.input<typeof createDelegationSchema>;
export type CreateDelegationOutput = z.output<typeof createDelegationSchema>;
