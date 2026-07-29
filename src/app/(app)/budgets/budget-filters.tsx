"use client";

import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import {
  SEVERITY_ALL, SEVERITY_FACET_DOT, SEVERITY_FACET_LABEL, SEVERITY_FACET_OPTIONS,
} from "./types";
import type { SeverityFacet } from "./types";

/** Thin vertical rule between filter chips -- separates them without adding visual weight
 * (same idiom as ProjectFilters/PeopleTable). */
function FilterDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-border" />;
}

/** Presentational chip-idiom filter row -- state is owned by BudgetPortfolioTable (the parent),
 * same lift-state-into-the-table pattern as the clients/employees lists, so the KPI tiles above
 * (computed in page.tsx from the full unfiltered rows) never see the filtered subset. */
export function BudgetFilters({
  q,
  onQChange,
  severity,
  onSeverityChange,
  hasActiveFilters,
  onClear,
}: {
  q: string;
  onQChange: (value: string) => void;
  severity: SeverityFacet | typeof SEVERITY_ALL;
  onSeverityChange: (value: SeverityFacet | typeof SEVERITY_ALL) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  const chip = (active: boolean) =>
    active
      ? "rounded-full border-border bg-background shadow-xs"
      : "rounded-full border-transparent bg-muted/60 shadow-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search projects or clients…"
        value={q}
        onChange={(e) => onQChange(e.target.value)}
        className="mr-3 w-84 rounded-full border-transparent bg-muted/60 shadow-none"
      />
      <Select
        value={severity}
        onValueChange={(v) => onSeverityChange((v as SeverityFacet | typeof SEVERITY_ALL) ?? SEVERITY_ALL)}
      >
        <SelectTrigger className={chip(severity !== SEVERITY_ALL)}>
          <SelectValue>
            {(v: string) =>
              v === SEVERITY_ALL ? (
                "All projects"
              ) : (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${SEVERITY_FACET_DOT[v as SeverityFacet]}`}
                  />
                  {SEVERITY_FACET_LABEL[v as SeverityFacet]}
                </span>
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEVERITY_ALL}>All projects</SelectItem>
          {SEVERITY_FACET_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${SEVERITY_FACET_DOT[s]}`} />
                {SEVERITY_FACET_LABEL[s]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FilterDivider />
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="rounded-full bg-red-500/8 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
        >
          <XIcon /> Clear filters
        </Button>
      )}
    </div>
  );
}
