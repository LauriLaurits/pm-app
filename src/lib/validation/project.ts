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
export const BUDGET_TYPE_OPTIONS = ["fixed", "hourly", "mixed"] as const;

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

/** Optional/nullable uuid — blank collapses to null, a non-blank value must parse as a uuid.
 * Shared by responsible_person_id (partSchema) and client_id (createProjectSchema). */
function nullableUuidField(message: string) {
  return z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || z.uuid().safeParse(v).success, message)
    .transform((v) => (v && v.trim() !== "" ? v : null));
}

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

// Creation is deliberately minimal: only `name` has no usable default. Status/health/priority
// all default to the same "healthy new project" values the form pre-fills, and budget_type
// -- NOT NULL in the DB with no column default -- gets one here (the form always submits
// 'fixed' unless the PM changes it). pm_id is NOT part of this schema: it's server-derived
// from the caller's session in createProjectAction, never trusted from the client (see the
// "create project" RLS policy, which requires pm_id = auth.uid() for non-admins anyway).
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  client_id: nullableUuidField("Invalid client"),
  description: nullableText(),
  status: z.enum(PROJECT_STATUS_OPTIONS).default("planning"),
  health: z.enum(PROJECT_HEALTH_OPTIONS).default("healthy"),
  priority: z.enum(PROJECT_PRIORITY_OPTIONS).default("medium"),
  budget_type: z.enum(BUDGET_TYPE_OPTIONS),
  start_date: nullableDate,
  deadline: nullableDate,
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectOutput = z.output<typeof createProjectSchema>;

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

const nullableUuid = nullableUuidField("Invalid person");

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

// ---------- credentials ----------
// Mirrors the DB enums from 20260715000006_credentials_delegations.sql exactly.

export const CREDENTIAL_TYPE_OPTIONS = [
  "server_login", "db_login", "api_key", "hosting",
  "admin_panel", "third_party", "ssh", "client_provided",
] as const;
export const CREDENTIAL_ENVIRONMENT_OPTIONS = ["prod", "prelive", "staging", "dev", "other"] as const;
// NOTE: DB enum is `pms_only` (not `pm_only` like project_links' visibility) -- matches
// migration 20260715000006_credentials_delegations.sql.
export const CREDENTIAL_VISIBILITY_OPTIONS = ["project_members", "pms_only", "admins_only"] as const;

/** Optional URL: blank collapses to null (like nullableText), a non-blank value must parse
 * as a URL. Kept separate from linkSchema's required `url` since related_url is optional here. */
const nullableUrl = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => !v || z.url().safeParse(v).success, "Enter a valid URL");

// secret is required here: this schema only ever backs credential *creation* (there is no
// edit/rotate flow yet -- see project-credentials.ts). It is write-only: it goes straight into
// Vault via the admin client and is never read back or rendered, only ever masked in the UI.
export const credentialSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(CREDENTIAL_TYPE_OPTIONS),
  username: nullableText(200),
  secret: z.string().min(1, "Secret is required").max(10_000),
  related_url: nullableUrl,
  environment: z.enum(CREDENTIAL_ENVIRONMENT_OPTIONS),
  visibility: z.enum(CREDENTIAL_VISIBILITY_OPTIONS),
  notes: nullableText(),
  expires_at: nullableDate,
});
export type CredentialInput = z.input<typeof credentialSchema>;
export type CredentialOutput = z.output<typeof credentialSchema>;
