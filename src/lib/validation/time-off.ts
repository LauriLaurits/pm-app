import { z } from "zod";

// Mirrors the DB enum from 20260715000004_people_workload.sql exactly.
export const TIME_OFF_TYPE_OPTIONS = ["vacation", "sick", "other"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** Blank/whitespace-only note collapses to null so the DB never stores "". */
const nullableNote = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

// DB check: `ends_on >= starts_on` (20260715000004_people_workload.sql) — mirrored here so bad
// input is rejected before it ever reaches the RLS'd insert/update. ISO `YYYY-MM-DD` strings
// compare correctly with plain `>=`, no Date parsing needed.
export const timeOffSchema = z
  .object({
    starts_on: isoDate,
    ends_on: isoDate,
    type: z.enum(TIME_OFF_TYPE_OPTIONS),
    note: nullableNote,
  })
  .refine((data) => data.ends_on >= data.starts_on, {
    message: "End date must be on or after the start date",
    path: ["ends_on"],
  });

export type TimeOffInput = z.input<typeof timeOffSchema>;
export type TimeOffOutput = z.output<typeof timeOffSchema>;
