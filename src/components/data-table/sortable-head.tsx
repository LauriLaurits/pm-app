"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortState } from "./use-sort";

/** A sortable column header: whole label is a button, cycles asc/desc, shows the direction
 * arrow when active and a faint hint arrow on hover otherwise. aria-sort tracks state. */
export function SortableHead<K extends string>({
  label,
  sortKey,
  sort,
  onToggle,
  className,
}: {
  label: string;
  /** NoInfer: K comes from the sort state's key union, so a typo'd sortKey is a type error
   * instead of silently widening K to the literal. */
  sortKey: NoInfer<K>;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <TableHead
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      className={className}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "group -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          active && "text-foreground"
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          // Always faintly visible -- sortability must be discoverable without hovering.
          <ChevronsUpDown className="size-3.5 opacity-40 transition-opacity group-hover:opacity-70" />
        )}
      </button>
    </TableHead>
  );
}
