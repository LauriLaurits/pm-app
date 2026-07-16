import { UTILIZATION_CELL_CLASS, UTILIZATION_CELL_EMPTY_CLASS, UTILIZATION_LABEL } from "@/lib/workload";
import { cn } from "@/lib/utils";

const LEGEND_ITEMS = [
  { key: "empty" as const, label: "Free (0%)", className: UTILIZATION_CELL_EMPTY_CLASS },
  { key: "available" as const, label: `${UTILIZATION_LABEL.available} (1-49%)`, className: UTILIZATION_CELL_CLASS.available },
  { key: "partial" as const, label: `${UTILIZATION_LABEL.partial} (50-89%)`, className: UTILIZATION_CELL_CLASS.partial },
  { key: "full" as const, label: `${UTILIZATION_LABEL.full} (90-100%)`, className: UTILIZATION_CELL_CLASS.full },
  { key: "overallocated" as const, label: `${UTILIZATION_LABEL.overallocated} (>100%)`, className: UTILIZATION_CELL_CLASS.overallocated },
];

export function WorkloadLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-sm", item.className)} />
          {item.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-muted ring-2 ring-inset ring-sky-400 dark:ring-sky-300" />
        On vacation
      </div>
    </div>
  );
}
