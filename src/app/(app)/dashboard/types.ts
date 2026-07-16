import type { Database } from "@/lib/database.types";

export type ProjectListRow = Database["public"]["Views"]["project_list_rows"]["Row"];
export type ProjectBudgetRow = Database["public"]["Views"]["project_budget_rows"]["Row"];
export type PersonWorkloadRow = Database["public"]["Views"]["person_workload_rows"]["Row"];

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
