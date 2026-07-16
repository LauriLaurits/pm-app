import { z } from "zod";

// Mirrors the DB enums from 20260715000004_people_workload.sql exactly.
export const EMPLOYMENT_TYPE_OPTIONS = ["employee", "contractor", "freelance"] as const;
export const PERSON_STATUS_OPTIONS = ["active", "inactive"] as const;

/** Blank/whitespace-only optional text collapses to null so the DB never stores "". */
function nullableText(max = 4000) {
  return z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));
}

const nullableEmail = z
  .string()
  .max(320)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email");

export const personSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(200),
  email: nullableEmail,
  role_title: nullableText(200),
  department: nullableText(200),
  employment_type: z.enum(EMPLOYMENT_TYPE_OPTIONS),
  // weekly_capacity_hours: numeric(5,2) not null default 40, must be >0 and <=168 (hours in a week).
  weekly_capacity_hours: z
    .number()
    .gt(0, "Must be greater than 0")
    .max(168, "Cannot exceed 168 hours/week"),
  status: z.enum(PERSON_STATUS_OPTIONS),
});
// `.input` (pre-transform shape) is what the form holds and the action receives from the
// client; `.output` (post-transform, e.g. "" -> null) is what safeParse hands back for the DB.
export type PersonInput = z.input<typeof personSchema>;
export type PersonOutput = z.output<typeof personSchema>;
