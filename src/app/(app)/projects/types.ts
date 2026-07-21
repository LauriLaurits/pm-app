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

// "● Active"-style soft badges (Linear/Stripe language): one quiet filled chip everywhere, the
// dot carries the state color. Calmer than per-state pill colors at table density.
export const STATUS_SOFT_BADGE_CLASS =
  "border-transparent bg-muted/70 font-normal text-foreground/80";

// Every status gets its OWN dot color (planning and archived used to share gray and read as
// the same state): planning violet, active green, on hold orange, completed blue, archived gray.
export const STATUS_DOT: Record<ProjectStatus, string> = {
  planning: "bg-violet-400",
  active: "bg-emerald-500",
  on_hold: "bg-orange-400",
  completed: "bg-blue-500",
  archived: "bg-muted-foreground/40",
};

// Budget-type chip colors (mixed purple / fixed blue / hourly teal) -- the pricing model reads
// at a glance in the budget cell without a word of extra text weight.
export const BUDGET_TYPE_CHIP_CLASS: Record<BudgetType, string> = {
  mixed: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  fixed: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  hourly: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400",
};

// Hand-rolled (NOT Intl compact notation): Node and browsers ship different ICU data, so
// Intl's "€8K" vs "€8.0K" caused a hydration mismatch. This is deterministic everywhere.
export function formatMoneyCompact(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  const fmt = (v: number) => {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  };
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `€${fmt(amount / 1_000_000)}M`;
  if (abs >= 1_000) return `€${fmt(amount / 1_000)}K`;
  return `€${Math.round(amount)}`;
}

export const HEALTH_BADGE_CLASS: Record<ProjectHealth, string> = {
  healthy:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  critical: "",
};

export const PRIORITY_OPTIONS: ProjectPriority[] = ["low", "medium", "high"];

// One priority color scheme for EVERY surface (list inline chip + detail header badge must
// match): high red, medium blue, low gray -- semantic color where it drives a decision.
export const PRIORITY_BADGE_CLASS: Record<ProjectPriority, string> = {
  low: "border-transparent bg-muted/70 font-normal text-muted-foreground",
  medium: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  high: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

// Inline-edit option lists (InlineEditSelect) -- one place mapping each enum's values to the
// same badge look the read-only cells already used, so the editable cell and the plain badge
// are visually identical when the caller can't edit.
// Pill-less in tables: dot + capitalized text only, so Health stays the single colored badge
// in a row. (Detail header/cards keep the soft chip via DotBadge.)
export const STATUS_INLINE_OPTIONS: InlineEditOption[] = STATUS_OPTIONS.map((s) => ({
  value: s,
  label: humanize(s).replace(/^./, (c) => c.toUpperCase()),
  badgeVariant: "outline",
  badgeClassName: "border-transparent bg-transparent px-0 font-normal text-foreground/80",
  dotClassName: STATUS_DOT[s],
}));

export const HEALTH_INLINE_OPTIONS: InlineEditOption[] = HEALTH_OPTIONS.map((h) => ({
  value: h,
  label: humanize(h),
  badgeVariant: h === "critical" ? "destructive" : "outline",
  badgeClassName: HEALTH_BADGE_CLASS[h],
}));

// Label carries the full phrase ("High priority") so the chip reads as ONE piece -- a colored
// "high" next to a plain gray "priority" looked broken.
export const PRIORITY_INLINE_OPTIONS: InlineEditOption[] = PRIORITY_OPTIONS.map((p) => ({
  value: p,
  label: `${p.charAt(0).toUpperCase()}${p.slice(1)} priority`,
  badgeVariant: "outline",
  badgeClassName: PRIORITY_BADGE_CLASS[p],
}));

// Compact list presentation: priority tints the project NAME itself (high red / medium blue /
// low default ink), full wording in the hover title. No extra chip or dot in the row.
export const PRIORITY_NAME_CLASS: Record<ProjectPriority, string> = {
  low: "",
  medium: "text-blue-700 dark:text-blue-400",
  high: "text-red-700 dark:text-red-400",
};

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
