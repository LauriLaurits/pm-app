"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  consumptionBarClasses, consumptionLabel, consumptionSeverity, formatMoney,
} from "@/lib/budget";
import { PROJECT_ICONS, type ProjectIconKey } from "@/lib/project-icons";
import { BUDGET_TYPE_CHIP_CLASS } from "../projects/types";
import { BudgetFilters } from "./budget-filters";
import {
  BUDGET_STATUS_BADGE_CLASS, BUDGET_STATUS_LABEL, BUDGET_STATUS_RANK,
  SEVERITY_ALL, budgetStatus, humanize,
} from "./types";
import type { ProjectBudgetRow, SeverityFacet } from "./types";

const PAGE_SIZE = 10;

type SortKey = "project" | "type" | "amount" | "consumption" | "remaining" | "margin" | "status";

const ACCESSORS: SortAccessors<ProjectBudgetRow, SortKey> = {
  project: (r) => r.name,
  type: (r) => r.budget_type,
  amount: (r) => r.client_amount,
  consumption: (r) => r.consumption_pct,
  remaining: (r) => r.remaining,
  margin: (r) => r.margin,
  status: (r) => BUDGET_STATUS_RANK[budgetStatus(r)],
};

export function BudgetPortfolioTable({
  rows,
  clientIdByName = {},
  iconKeys = {},
}: {
  rows: ProjectBudgetRow[];
  /** name -> client id, built server-side (the budget view carries names only). */
  clientIdByName?: Record<string, string>;
  /** project id -> icon key, built server-side the same way projects/page.tsx builds it (the
   * budget view carries no tags). */
  iconKeys?: Record<string, ProjectIconKey>;
}) {
  // Client-side search + severity facet (list is small, same pattern as ClientsTable/PeopleTable):
  // matches project OR client name. The KPI tiles in page.tsx are computed from the full,
  // unfiltered `rows` prop -- this component's local state never reaches them, so totals stay
  // portfolio-wide no matter what's typed/selected here.
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<SeverityFacet | typeof SEVERITY_ALL>(SEVERITY_ALL);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        query &&
        !(row.name ?? "").toLowerCase().includes(query) &&
        !(row.client_name ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      if (severity !== SEVERITY_ALL) {
        const sev = consumptionSeverity(row.consumption_pct);
        // "at_risk" is inclusive of "over" (both are >=75%); "over" is the strict >=100% subset.
        const matches = severity === "over" ? sev === "over" : sev !== "ok";
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, q, severity]);

  const { rows: sorted, sort, toggle } = useSort(filtered, ACCESSORS, {
    key: "consumption",
    dir: "desc",
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hasActiveFilters = Boolean(q.trim()) || severity !== SEVERITY_ALL;

  function clearAll() {
    setQ("");
    setSeverity(SEVERITY_ALL);
  }

  return (
    <div className="space-y-4">
      <BudgetFilters
        q={q}
        onQChange={setQ}
        severity={severity}
        onSeverityChange={setSeverity}
        hasActiveFilters={hasActiveFilters}
        onClear={clearAll}
      />
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
                <SortableHead label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                <SortableHead label="Client amount" sortKey="amount" sort={sort} onToggle={toggle} />
                <SortableHead
                  label="Invoiced / consumption"
                  sortKey="consumption"
                  sort={sort}
                  onToggle={toggle}
                  className="w-48"
                />
                <SortableHead label="Remaining" sortKey="remaining" sort={sort} onToggle={toggle} />
                <SortableHead label="Margin" sortKey="margin" sort={sort} onToggle={toggle} />
                <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                <TableHead className="w-10 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                // project_budget_rows is a plain view, so every column is nullable even though
                // `id` is never actually null in practice (it's the projects table's PK).
                if (!row.id) return null;
                const projectId = row.id;
                const clientId = row.client_name ? clientIdByName[row.client_name] : undefined;
                const Icon = PROJECT_ICONS[iconKeys[projectId] ?? "folder"].icon;
                return (
                  <TableRow key={projectId} className="group">
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
                            href={`/projects/${projectId}/budget`}
                            className="text-base leading-tight font-semibold transition-opacity hover:opacity-70"
                          >
                            {row.name}
                          </Link>
                          <ClientSubline name={row.client_name} clientId={clientId} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.budget_type ? (
                        <Badge variant="outline" className={BUDGET_TYPE_CHIP_CLASS[row.budget_type]}>
                          {humanize(row.budget_type)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatMoney(row.client_amount)}</TableCell>
                    <TableCell className="w-48">
                      <ConsumptionCell row={row} />
                    </TableCell>
                    <TableCell>{formatMoney(row.remaining)}</TableCell>
                    <TableCell>
                      <MarginCell row={row} />
                    </TableCell>
                    <TableCell>
                      <StatusPill row={row} />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Actions surface on row hover -- stay visible while focused or while the
                          menu is open, so keyboard users aren't locked out. */}
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          render={<Link href={`/projects/${projectId}/budget`} />}
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
                            <DropdownMenuItem render={<Link href={`/projects/${projectId}`}>Overview</Link>} />
                            <DropdownMenuItem
                              render={<Link href={`/projects/${projectId}/budget`}>Budgets</Link>}
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

// Muted client subline under the project name -- plain text (per the mockup, no avatar chip),
// linking to the client detail page when this viewer can resolve it (RLS-scoped: a viewer
// without the clients permission simply gets an unlinked name).
function ClientSubline({ name, clientId }: { name: string | null; clientId?: string }) {
  if (!name) return <div className="mt-0.5 text-xs text-muted-foreground">—</div>;
  if (!clientId) return <div className="mt-0.5 text-xs text-muted-foreground">{name}</div>;
  return (
    <Link
      href={`/clients/${clientId}`}
      className="mt-0.5 inline-block text-xs text-muted-foreground transition-opacity hover:opacity-70"
    >
      {name}
    </Link>
  );
}

// Coarse triage pill (mockup-driven) -- see budgetStatus in types.ts for the exact tiering
// (reuses consumptionSeverity verbatim, never forks the thresholds). Distinct from
// ConsumptionCell's 4-tier bar: this is the one-glance "where's my attention needed" signal.
//
// A null client_amount NEVER renders a "No budget" badge -- project_budget_rows collapses
// "genuinely no budget" and "RLS-hidden from this viewer" into the identical NULL (view_budget
// is per-project for PMs, so one viewer's portfolio can mix visible and hidden rows), and the
// view's own migration comment is explicit that null must read as "you can't see this," never as
// an affirmative claim. So this cell falls back to the exact same plain muted dash every other
// gated cell in the row already uses for that null (see ConsumptionCell/MarginCell below).
function StatusPill({ row }: { row: ProjectBudgetRow }) {
  const status = budgetStatus(row);
  if (status === "no_budget") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="outline" className={BUDGET_STATUS_BADGE_CLASS[status]}>
      {BUDGET_STATUS_LABEL[status]}
    </Badge>
  );
}

// Flagship bar anatomy (same as BudgetCell/WorkloadCell): h-[11px] track, values BELOW the bar,
// pct pinned to the column's right edge. role="progressbar" + aria-value* kept from the previous
// implementation -- do not drop these when restyling.
function ConsumptionCell({ row }: { row: ProjectBudgetRow }) {
  if (row.client_amount === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const pct = row.consumption_pct ?? 0;
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="min-w-40 text-xs">
      <div
        className="h-[11px] w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={consumptionLabel(row.consumption_pct)}
      >
        <div
          className={`h-full rounded-full ${consumptionBarClasses(row.consumption_pct)}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums whitespace-nowrap">
        <span className="text-sm font-medium text-foreground">{formatMoney(row.invoiced)}</span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// Finance-gated (view_internal_cost): null margin renders "—" rather than a misleading zero --
// the value comes straight off the gated view column, never re-derived here.
function MarginCell({ row }: { row: ProjectBudgetRow }) {
  if (row.margin === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="text-sm tabular-nums">
      <span className="font-medium text-foreground">{formatMoney(row.margin)}</span>
      {row.margin_pct !== null && (
        <span className="ml-1.5 text-xs text-muted-foreground">{row.margin_pct.toFixed(1)}%</span>
      )}
    </div>
  );
}
