import { z } from "zod";

/** Optional part id — blank/absent collapses to null (a time entry needn't tie to a specific
 * project part). Mirrors the `nullableUuid` pattern in `validation/project.ts`. */
const nullableUuid = z
  .string()
  .optional()
  .nullable()
  .refine((v) => !v || z.uuid().safeParse(v).success, "Invalid part")
  .transform((v) => (v && v.trim() !== "" ? v : null));

/** Blank/whitespace-only description collapses to null so the DB never stores "". */
const nullableText = (max = 2000) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

// Deliberately NO `person_id` field here — the person is always derived server-side from the
// caller's own `people` row (see logTimeAction in src/app/actions/time-entries.ts), never taken
// from client input. Same reasoning for why there's no `id`/`created_at`.
export const timeEntrySchema = z.object({
  project_id: z.uuid("Select a project"),
  project_part_id: nullableUuid,
  entry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  // DB check: `hours > 0 and hours <= 744` (raised so a monthly total logs as one entry —
  // 20260720000006_person_allocation_and_monthly_time.sql). Mirrored here so bad input is rejected
  // before it reaches the RLS'd insert.
  hours: z
    .number({ message: "Enter the hours worked" })
    .gt(0, "Hours must be greater than 0")
    .lte(744, "That's more hours than a month has"),
  billable: z.boolean(),
  description: nullableText(),
});

export type TimeEntryInput = z.input<typeof timeEntrySchema>;
export type TimeEntryOutput = z.output<typeof timeEntrySchema>;
