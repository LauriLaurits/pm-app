import type { Database } from "@/lib/database.types";

export type ProjectListRow = Database["public"]["Views"]["project_list_rows"]["Row"];
export type ProjectBudgetRow = Database["public"]["Views"]["project_budget_rows"]["Row"];
export type PersonWorkloadRow = Database["public"]["Views"]["person_workload_rows"]["Row"];

// Shared between dashboard/compute.ts (over-budget attention, summary cards) and
// reports/compute.ts (budget-spent / capacity charts) -- one definition so both stay in sync.
export type ValidBudgetRow = ProjectBudgetRow & { id: string; name: string };
// Alias for the new (Task 2+) builders, which spell it "BudgetRow" per the plan's interface list
// -- same type, kept as one alias rather than a second definition so the two names never drift.
export type BudgetRow = ValidBudgetRow;

export type ValidPerson = {
  id: string;
  full_name: string;
  current_allocation_pct: number | null;
  weekly_capacity_hours: number | null;
};

// project_list_rows (a security_invoker view) has no pm_id column -- only pm_name/pm_avatar_url
// (see supabase/migrations/20260715000007_project_views.sql). buildMyProjects needs the real
// pm_id to test "is this the viewer's own project", so callers that need it merge it in from a
// separate `projects` table read (same two-step idiom the People/Clients pages already use for
// editable-ids checks, e.g. projects/page.tsx:136). Optional here (not on the base view) so every
// EXISTING call site that builds a ValidProject without pm_id still satisfies this type unchanged.
export type ValidProject = ProjectListRow & { id: string; name: string; pm_id?: string | null };

// Widened person_workload_rows shape the new builders need: status + on_vacation_now (for
// computeSummary's availableCount, mirroring people/page.tsx's Available rule) and avatar_url
// (for the Team card, Task 4). ValidPerson above stays as-is for the older callers that don't need
// these fields (reports' capacity chart).
export type WorkloadPerson = {
  id: string;
  full_name: string;
  current_allocation_pct: number | null;
  weekly_capacity_hours: number | null;
  status: Database["public"]["Enums"]["person_status"] | null;
  on_vacation_now: boolean | null;
  avatar_url: string | null;
};

// Shape fetchExpiringCredentials already returns (credentials row + a JS-joined project name).
export type ExpiringCredential = {
  id: string;
  name: string;
  expires_at: string;
  project_id: string;
  projectName: string | null;
};

// Shape fetchMilestonesUpcoming returns (project_milestones row + a JS-joined project name).
export type MilestoneLite = {
  id: string;
  project_id: string;
  name: string;
  due_on: string;
  done: boolean;
  projectName: string | null;
};

// Generic shape for items returned by computeOverallocatedPeople (used in page.tsx).
export type AttentionItem = {
  id: string;
  href: string;
  primary: string;
  secondary?: string;
  badgeLabel?: string;
  badgeClassName?: string;
};
