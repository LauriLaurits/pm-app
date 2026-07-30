import type { Database } from "@/lib/database.types";
import { utilizationClass, utilizationLabel, type UtilizationClass } from "@/lib/workload";

export type PersonWorkloadRow = Database["public"]["Views"]["person_workload_rows"]["Row"];
export type EmploymentType = Database["public"]["Enums"]["employment_type"];

// person_workload_rows has no `email` column (see 20260716000002_workload_views.sql) -- the
// page fetches it separately from `people` for managers only (needed as an edit-form default).
// `id` is narrowed to non-null: it's the view's underlying primary key and never actually null;
// the generated view type just marks every column nullable. page.tsx drops any (impossible) row
// missing it before rows ever reach this type, so downstream components can rely on `string`.
export type PersonListRow = Omit<PersonWorkloadRow, "id"> & { id: string; email: string | null };

// Render-safe projection of PersonListRow for the "use client" components fed by the people
// list AND the person-detail edit dialog (PeopleTable, PersonRowActions, PersonForm,
// PersonFormDialog): whatever shape crosses that boundary gets serialized into the flight
// payload, readable in the raw page response by ANY viewer who can load the page -- not just
// managers, and not just the subset who also hold view_internal_cost. `internal_cost` /
// `billing_rate` are DB-nulled by RLS for everyone without view_internal_cost, but for the
// finance-visibility population itself they'd otherwise ship for EVERY employee on a page whose
// UI never shows them (the one place that legitimately does, FinancialsCard on the detail page,
// is a server component and reads PersonWorkloadRow directly -- never this type). `skills` is
// similarly fetched by the view but never rendered anywhere in this tab. Add a field ONLY when a
// component fed by this type actually renders/uses it.
export type SafePersonRow = Pick<
  PersonListRow,
  | "id"
  | "full_name"
  | "avatar_url"
  | "role_title"
  | "department"
  | "employment_type"
  | "status"
  | "current_allocation_pct"
  | "weekly_capacity_hours"
  | "active_project_count"
  | "on_vacation_now"
  | "vacation_ends_on"
  | "email"
>;

export const EMPLOYMENT_TYPE_OPTIONS: EmploymentType[] = ["employee", "contractor", "freelance"];

export const AVAILABILITY_OPTIONS: UtilizationClass[] = [
  "available",
  "partial",
  "full",
  "overallocated",
];

export const AVAILABILITY_LABEL: Record<UtilizationClass, string> = {
  available: "Available",
  partial: "Partial",
  full: "Full",
  overallocated: "Overallocated",
};

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

export function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
}

export function formatMoney(amount: number | null) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** "2026-08-03" -> "3 Aug" -- compact enough to live inside a status badge. */
export function formatShortDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function rowMatchesAvailability(row: PersonWorkloadRow, availability: string | undefined) {
  if (!availability) return true;
  return utilizationClass(row.current_allocation_pct ?? 0) === availability;
}

export { utilizationClass, utilizationLabel };
