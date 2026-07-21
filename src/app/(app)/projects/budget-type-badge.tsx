import { Clock3, Layers2, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BudgetType } from "./types";

// Budget types get their OWN badge language -- squared, uppercase micro-label with a tiny icon,
// borderless soft fill -- deliberately unlike the rounded status/health pills so a pricing model
// never reads as a state.
const META: Record<BudgetType, { icon: LucideIcon; className: string }> = {
  fixed: { icon: Lock, className: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  hourly: { icon: Clock3, className: "bg-teal-500/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400" },
  mixed: { icon: Layers2, className: "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400" },
};

export function BudgetTypeBadge({ type, className }: { type: BudgetType; className?: string }) {
  const { icon: Icon, className: tone } = META[type];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        tone,
        className
      )}
    >
      <Icon className="size-3" />
      {type}
    </span>
  );
}
