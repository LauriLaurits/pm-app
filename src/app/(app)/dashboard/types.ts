import type { Database } from "@/lib/database.types";

export type ProjectListRow = Database["public"]["Views"]["project_list_rows"]["Row"];
export type ProjectBudgetRow = Database["public"]["Views"]["project_budget_rows"]["Row"];
export type PersonWorkloadRow = Database["public"]["Views"]["person_workload_rows"]["Row"];

// Shared between dashboard/compute.ts (over-budget attention, summary cards) and
// reports/compute.ts (budget-spent / capacity charts) -- one definition so both stay in sync.
export type ValidBudgetRow = ProjectBudgetRow & { id: string; name: string };
export type ValidPerson = {
  id: string;
  full_name: string;
  current_allocation_pct: number | null;
  weekly_capacity_hours: number | null;
};

// Generic shape for every "attention" list on the dashboard -- each row links out to the detail
// screen where the viewer can actually act on it.
export type AttentionItem = {
  id: string;
  href: string;
  primary: string;
  secondary?: string;
  badgeLabel?: string;
  badgeClassName?: string;
};

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

export function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
