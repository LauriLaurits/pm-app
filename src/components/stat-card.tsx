import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** KPI tile for list pages (projects, clients): tinted icon square + muted label + big
 * tabular-nums value. Extracted from the projects page (the flagship visual language) so every
 * list's stat row is pixel-identical -- pass the same `bg-*-500/10 text-*-600 dark:text-*-400`
 * pastel pair the projects cards use via `iconClass`. */
export function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
  context,
  contextClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  iconClass: string;
  /** Optional third line under the value ("28.7% of portfolio", "1 project over budget") --
   * mockup-driven; existing two-line consumers are unaffected when omitted. */
  context?: string;
  /** Override the context line's tone (e.g. amber/red when it carries a warning). */
  contextClass?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl leading-tight font-semibold tabular-nums">{value}</p>
          {context && (
            <p className={`truncate text-xs ${contextClass ?? "text-muted-foreground"}`}>{context}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
