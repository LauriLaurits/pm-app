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

export function rowMatchesAvailability(row: PersonWorkloadRow, availability: string | undefined) {
  if (!availability) return true;
  return utilizationClass(row.current_allocation_pct ?? 0) === availability;
}

export { utilizationClass, utilizationLabel };
