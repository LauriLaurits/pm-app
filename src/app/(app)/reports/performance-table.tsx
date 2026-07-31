"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { consumptionBarClasses, consumptionLabel, formatMoney } from "@/lib/budget";
import { cn } from "@/lib/utils";
import { PROJECT_ICONS, type ProjectIconKey } from "@/lib/project-icons";
import {
  BUDGET_STATUS_BADGE_CLASS, BUDGET_STATUS_LABEL, BUDGET_STATUS_RANK,
} from "../budgets/types";
import type { BudgetStatus } from "../budgets/types";
import type { PerformanceRow } from "./types";

const PAGE_SIZE = 10;

type SortKey =
  | "project" | "budget" | "invoiced" | "cost" | "remaining" | "margin" | "hours" | "billable" | "status";

const ACCESSORS: SortAccessors<PerformanceRow, SortKey> = {
  project: (r) => r.name,
  budget: (r) => r.budget,
  invoiced: (r) => r.invoiced,
  cost: (r) => r.cost,
  remaining: (r) => r.remaining,
  margin: (r) => r.marginPct,
  hours: (r) => r.hoursLogged,
  billable: (r) => r.billablePct,
  status: (r) => BUDGET_STATUS_RANK[r.status as BudgetStatus],
};

type ProjectFilter = "all" | "with_budget" | "over_budget";

const FILTER_OPTIONS: { key: ProjectFilter; label: string }[] = [
  { key: "all", label: "All projects" },
  { key: "with_budget", label: "With budget" },
  { key: "over_budget", label: "Over budget" },
];

// Optional (gear-hideable) columns. Cost/margin are ONLY ever appended when the caller has
// finance visibility -- without it those keys never make it into this list, so they can't be
// toggled back on either (the whole column is omitted, never rendered blank).
type ColumnKey = "budget" | "invoiced" | "cost" | "remaining" | "margin" | "hours" | "billable";

function optionalColumns(hasFinanceVisibility: boolean): { key: ColumnKey; label: string }[] {
  return [
    { key: "budget", label: "Budget" },
    { key: "invoiced", label: "Invoiced" },
    ...(hasFinanceVisibility ? ([{ key: "cost", label: "Cost" }] as const) : []),
    { key: "remaining", label: "Remaining" },
    ...(hasFinanceVisibility ? ([{ key: "margin", label: "Margin %" }] as const) : []),
    { key: "hours", label: "Hours logged" },
    { key: "billable", label: "Billable %" },
  ];
}

// SafeRow discipline (security wave, 2026-07-29-reports-v2 task 5): this is a client component, so
// EVERY field on `rows` serializes to the browser -- `PerformanceRow` is already the allowlisted
// compute-layer output (src/app/(app)/reports/compute.ts's buildPerformanceRows), never a raw
// project_budget_rows/view row. `hasFinanceVisibility` is a plain boolean the page already derives
// (same one-liner the KPI row and Task 4's cards use) -- it's what gates Cost/Margin OFF entirely,
// not per-cell nulls (a viewer without finance visibility never has a non-null `cost`/`marginPct`
// on any row anyway, since those columns come straight off the RLS-gated view, but the columns
// still must not exist in the DOM at all -- a "—" column of dashes is not the same as an absent
// column).
export function PerformanceTable({
  rows,
  iconKeys = {},
  hasFinanceVisibility,
}: {
  rows: PerformanceRow[];
  iconKeys?: Record<string, ProjectIconKey>;
  hasFinanceVisibility: boolean;
}) {
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<ColumnKey>>(() => new Set());
  const show = (key: ColumnKey) => !hidden.has(key);

  const columns = useMemo(() => optionalColumns(hasFinanceVisibility), [hasFinanceVisibility]);

  const filtered = useMemo(() => {
    if (filter === "with_budget") return rows.filter((r) => r.status !== "no_budget");
    if (filter === "over_budget") return rows.filter((r) => r.status === "over");
    return rows;
  }, [rows, filter]);

  const { rows: sorted, sort, toggle } = useSort(filtered, ACCESSORS, {
    key: "project",
    dir: "asc",
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition-colors",
      active
        ? "border-border bg-background shadow-xs"
        : "border-transparent bg-muted/60 text-muted-foreground shadow-none hover:text-foreground"
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setFilter(opt.key)}
            className={chip(filter === opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No projects match your filters.
        </div>
      ) : (
        <div className="space-y-2">
          <Table className="[&_tbody_td]:py-4">
            <TableHeader>
              <TableRow>
                <SortableHead label="Project" sortKey="project" sort={sort} onToggle={toggle} />
                {show("budget") && (
                  <SortableHead label="Budget" sortKey="budget" sort={sort} onToggle={toggle} />
                )}
                {show("invoiced") && (
                  <SortableHead
                    label="Invoiced"
                    sortKey="invoiced"
                    sort={sort}
                    onToggle={toggle}
                    className="w-44"
                  />
                )}
                {hasFinanceVisibility && show("cost") && (
                  <SortableHead
                    label="Cost"
                    sortKey="cost"
                    sort={sort}
                    onToggle={toggle}
                    className="w-44"
                  />
                )}
                {show("remaining") && (
                  <SortableHead label="Remaining" sortKey="remaining" sort={sort} onToggle={toggle} />
                )}
                {hasFinanceVisibility && show("margin") && (
                  <SortableHead label="Margin %" sortKey="margin" sort={sort} onToggle={toggle} />
                )}
                {show("hours") && (
                  <SortableHead label="Hours logged" sortKey="hours" sort={sort} onToggle={toggle} />
                )}
                {show("billable") && (
                  <SortableHead
                    label="Billable %"
                    sortKey="billable"
                    sort={sort}
                    onToggle={toggle}
                    className="w-36"
                  />
                )}
                <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                <TableHead className="w-10 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="Configure columns"
                      className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
                    >
                      <Settings2 className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* base-ui gotcha: DropdownMenuLabel throws unless wrapped in a group. */}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Columns</DropdownMenuLabel>
                      </DropdownMenuGroup>
                      {columns.map((c) => (
                        <DropdownMenuCheckboxItem
                          key={c.key}
                          checked={show(c.key)}
                          onCheckedChange={() =>
                            setHidden((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.key)) next.delete(c.key);
                              else next.add(c.key);
                              return next;
                            })
                          }
                        >
                          {c.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const Icon = PROJECT_ICONS[iconKeys[row.id] ?? "folder"].icon;
                return (
                  <TableRow key={row.id} className="group">
                    {/* NO left edge accent line EVER -- the badges/bar carry the signal. */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/25 bg-muted/30 text-muted-foreground"
                        >
                          <Icon className="size-4.5" />
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/projects/${row.id}/budget`}
                            className="text-base leading-tight font-semibold transition-opacity hover:opacity-70"
                          >
                            {row.name}
                          </Link>
                          {/* Block, not inline -- an inline sibling here would flow beside the
                              name instead of under it (the bug this table must not repeat). */}
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {row.clientName ?? "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    {show("budget") && <TableCell>{formatMoney(row.budget)}</TableCell>}
                    {show("invoiced") && (
                      <TableCell className="w-44">
                        <ConsumptionBarCell value={row.invoiced} pct={row.invoicedPct} />
                      </TableCell>
                    )}
                    {hasFinanceVisibility && show("cost") && (
                      <TableCell className="w-44">
                        <ConsumptionBarCell value={row.cost} pct={row.costPct} />
                      </TableCell>
                    )}
                    {show("remaining") && (
                      <TableCell>
                        <RemainingCell value={row.remaining} />
                      </TableCell>
                    )}
                    {hasFinanceVisibility && show("margin") && (
                      <TableCell>
                        <MarginCell value={row.marginPct} />
                      </TableCell>
                    )}
                    {show("hours") && (
                      <TableCell className="tabular-nums">{row.hoursLogged.toFixed(1)} h</TableCell>
                    )}
                    {show("billable") && (
                      <TableCell className="w-36">
                        <BillableCell pct={row.billablePct} />
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusPill status={row.status as BudgetStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Actions surface on row hover -- stay visible while focused or while the
                          menu is open, so keyboard users aren't locked out. */}
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          render={<Link href={`/projects/${row.id}/budget`} />}
                        >
                          Open
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${row.name}`}
                            className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem render={<Link href={`/projects/${row.id}`}>Overview</Link>} />
                            <DropdownMenuItem
                              render={<Link href={`/projects/${row.id}/budget`}>Budget</Link>}
                            />
                            <DropdownMenuItem
                              render={<Link href={`/projects/${row.id}/people`}>Team</Link>}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span>
              Showing {sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length} project
              {sorted.length === 1 ? "" : "s"}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Coarse triage pill, reusing the budgets StatusPill's exact rule (BUDGET_STATUS_BADGE_CLASS/
// LABEL, import/share -- never fork): a null/"no_budget" status NEVER renders a "No budget" badge
// (see budgets/types.ts's block comment -- the null collapses "genuinely no budget" and
// "RLS-hidden from this viewer" into the same value), just the same plain muted dash every other
// gated cell in this row already uses.
function StatusPill({ status }: { status: BudgetStatus }) {
  if (status === "no_budget") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="outline" className={BUDGET_STATUS_BADGE_CLASS[status]}>
      {BUDGET_STATUS_LABEL[status]}
    </Badge>
  );
}

// Flagship bar anatomy (budget-portfolio-table's ConsumptionCell) generalized for both
// Invoiced (invoicedPct) and Cost (costPct) -- same h-[11px] track, value below the bar, pct
// pinned to the column's right edge. `value === null` renders the shared muted dash (gated or
// genuinely absent, same convention as every other cell here). `pct === null` with a non-null
// value (e.g. a cost-only project with no budget to compare against) falls back to a plain value
// with no bar/pct rather than a misleading 0%-wide bar.
function ConsumptionBarCell({ value, pct }: { value: number | null; pct: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (pct === null) {
    return <span className="text-sm font-medium text-foreground">{formatMoney(value)}</span>;
  }
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="min-w-40 text-xs">
      <div
        className="h-[11px] w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={consumptionLabel(pct)}
      >
        <div
          className={`h-full rounded-full ${consumptionBarClasses(pct)}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums whitespace-nowrap">
        <span className="text-sm font-medium text-foreground">{formatMoney(value)}</span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// Remaining -- red the moment it's negative (over budget), plain otherwise. "—" for a gated/absent
// value, same as every other money cell.
function RemainingCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        value < 0 && "font-medium text-red-600 dark:text-red-400"
      )}
    >
      {formatMoney(value)}
    </span>
  );
}

// Finance-gated (view_internal_cost, read verbatim off margin_pct -- never re-derived here).
function MarginCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="tabular-nums">{value.toFixed(1)}%</span>;
}

// Billable % -- value + thin bar, but a NEUTRAL fill (not consumption-severity colors): a lower
// billable share isn't a budget-overrun warning, it's often deliberate (internal/non-billable
// work), so it doesn't borrow the red/orange/emerald severity scale.
function BillableCell({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="min-w-28 text-xs">
      <div
        className="h-[11px] w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct.toFixed(0)}% billable`}
      >
        <div className="h-full rounded-full bg-[var(--viz-series-1)]" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1 text-right text-muted-foreground tabular-nums">{pct.toFixed(0)}%</div>
    </div>
  );
}
