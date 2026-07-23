import { cn } from "@/lib/utils";
import type { EmploymentType } from "./types";

// Employment types get the BudgetTypeBadge micro-chip language -- squared, uppercase, borderless
// soft fill -- deliberately unlike the rounded status pills so an engagement type never reads as
// a state. Neutral gray for the default (employee), color only for the external types.
// Shared between the list table and the person form so the two can never drift.
export const EMPLOYMENT_TYPE_BADGE_CLASS: Record<EmploymentType, string> = {
  employee: "bg-muted text-muted-foreground",
  contractor: "bg-teal-500/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  freelance: "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
};

export function EmploymentTypeBadge({ type }: { type: EmploymentType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        EMPLOYMENT_TYPE_BADGE_CLASS[type]
      )}
    >
      {type}
    </span>
  );
}
