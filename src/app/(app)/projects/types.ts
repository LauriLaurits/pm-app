import type { Database } from "@/lib/database.types";
import type { InlineEditOption } from "@/components/inline-edit-select";

export type ProjectListRow = Database["public"]["Views"]["project_list_rows"]["Row"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type ProjectHealth = Database["public"]["Enums"]["project_health"];
export type ProjectPriority = Database["public"]["Enums"]["project_priority"];
export type BudgetType = Database["public"]["Enums"]["budget_type"];

export const STATUS_OPTIONS: ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
];

export const HEALTH_OPTIONS: ProjectHealth[] = ["healthy", "warning", "critical"];

export const BUDGET_TYPE_OPTIONS: BudgetType[] = ["fixed", "hourly", "mixed"];

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

export const STATUS_BADGE: Record<ProjectStatus, BadgeVariant> = {
  planning: "outline",
  active: "default",
  on_hold: "secondary",
  completed: "secondary",
  archived: "ghost",
};

export const HEALTH_BADGE_CLASS: Record<ProjectHealth, string> = {
  healthy:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  critical: "",
};

export const PRIORITY_OPTIONS: ProjectPriority[] = ["low", "medium", "high"];

export const PRIORITY_BADGE: Record<ProjectPriority, BadgeVariant> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

// Inline-edit option lists (InlineEditSelect) -- one place mapping each enum's values to the
// same badge look the read-only cells already used, so the editable cell and the plain badge
// are visually identical when the caller can't edit.
export const STATUS_INLINE_OPTIONS: InlineEditOption[] = STATUS_OPTIONS.map((s) => ({
  value: s,
  label: humanize(s),
  badgeVariant: STATUS_BADGE[s],
}));

export const HEALTH_INLINE_OPTIONS: InlineEditOption[] = HEALTH_OPTIONS.map((h) => ({
  value: h,
  label: humanize(h),
  badgeVariant: h === "critical" ? "destructive" : "outline",
  badgeClassName: HEALTH_BADGE_CLASS[h],
}));

export const PRIORITY_INLINE_OPTIONS: InlineEditOption[] = PRIORITY_OPTIONS.map((p) => ({
  value: p,
  label: humanize(p),
  badgeVariant: PRIORITY_BADGE[p],
}));

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

export function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
