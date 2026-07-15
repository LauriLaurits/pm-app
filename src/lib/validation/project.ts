import { z } from "zod";

export const PROJECT_STATUS_OPTIONS = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
] as const;
export const PROJECT_HEALTH_OPTIONS = ["healthy", "warning", "critical"] as const;
export const PROJECT_PRIORITY_OPTIONS = ["low", "medium", "high"] as const;

/** Blank/whitespace-only optional text collapses to null so the DB never stores "". */
function nullableText(max = 4000) {
  return z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));
}

const nullableDate = z
  .string()
  .optional()
  .nullable()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date")
  .transform((v) => (v ? v : null));

export const editProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: nullableText(),
  status: z.enum(PROJECT_STATUS_OPTIONS),
  health: z.enum(PROJECT_HEALTH_OPTIONS),
  priority: z.enum(PROJECT_PRIORITY_OPTIONS),
  start_date: nullableDate,
  deadline: nullableDate,
  progress: z.number().int().min(0).max(100),
  risks: nullableText(),
  blockers: nullableText(),
  next_steps: nullableText(),
  internal_notes: nullableText(),
  client_notes: nullableText(),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
});
// `.input` (pre-transform shape) is what forms hold and what the action receives from the
// client; `.output` (post-transform, e.g. "" -> null) is what safeParse hands back for the DB.
export type EditProjectInput = z.input<typeof editProjectSchema>;
export type EditProjectOutput = z.output<typeof editProjectSchema>;

export const statusUpdateSchema = z
  .object({
    completed: nullableText(),
    in_progress: nullableText(),
    blockers: nullableText(),
    decisions_needed: nullableText(),
    next_milestone: nullableText(),
    handover_info: nullableText(),
  })
  .refine((data) => Object.values(data).some((v) => v !== null), {
    message: "Fill in at least one field",
    path: ["completed"],
  });
export type StatusUpdateInput = z.input<typeof statusUpdateSchema>;
export type StatusUpdateOutput = z.output<typeof statusUpdateSchema>;
