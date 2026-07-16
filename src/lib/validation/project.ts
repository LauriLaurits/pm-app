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

export const PART_STATUS_OPTIONS = ["not_started", "in_progress", "blocked", "done"] as const;
export const BILLING_MODEL_OPTIONS = ["fixed", "hourly"] as const;

const nullableUuid = z
  .string()
  .optional()
  .nullable()
  .refine((v) => !v || z.uuid().safeParse(v).success, "Invalid person")
  .transform((v) => (v && v.trim() !== "" ? v : null));

/** Optional/nullable money-or-hours figure — used for estimated_hours and the three
 * part_billing figures, all of which are plain non-negative numbers or absent. */
const nullableAmount = z.number().min(0).max(10_000_000).optional().nullable();

// part_billing fields (client_price/fixed_amount/hourly_rate) are bundled into the same
// schema as project_parts fields for form convenience, but the action only ever writes
// them to part_billing, and only when the caller holds view_budget -- see project-parts.ts.
export const partSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: nullableText(),
  status: z.enum(PART_STATUS_OPTIONS),
  responsible_person_id: nullableUuid,
  billing_model: z.enum(BILLING_MODEL_OPTIONS),
  estimated_hours: nullableAmount,
  progress: z.number().int().min(0).max(100),
  start_date: nullableDate,
  end_date: nullableDate,
  notes: nullableText(),
  client_price: nullableAmount,
  fixed_amount: nullableAmount,
  hourly_rate: nullableAmount,
});
export type PartInput = z.input<typeof partSchema>;
export type PartOutput = z.output<typeof partSchema>;

// ---------- project members (access) ----------

/** Adds an existing user_profiles user (picked via their `people` row) as a project member. */
export const addMemberSchema = z.object({
  user_id: z.uuid("Select a person"),
  role_on_project: nullableText(200),
  starts_on: nullableDate,
  ends_on: nullableDate,
});
export type AddMemberInput = z.input<typeof addMemberSchema>;
export type AddMemberOutput = z.output<typeof addMemberSchema>;

// ---------- project links ----------

export const LINK_TYPE_OPTIONS = [
  "repo", "issue_tracker", "design", "docs",
  "env_prod", "env_prelive", "env_staging", "env_dev",
  "api_docs", "monitoring", "hosting", "db_dashboard", "custom",
] as const;
// NOTE: DB enum is `pm_only` (not `pms_only`) — matches migration 20260715000003_projects.sql.
export const LINK_VISIBILITY_OPTIONS = ["project", "pm_only", "admins_only"] as const;

export const linkSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  url: z.url("Enter a valid URL").max(2000),
  type: z.enum(LINK_TYPE_OPTIONS),
  environment: nullableText(100),
  description: nullableText(),
  visibility: z.enum(LINK_VISIBILITY_OPTIONS),
});
export type LinkInput = z.input<typeof linkSchema>;
export type LinkOutput = z.output<typeof linkSchema>;
