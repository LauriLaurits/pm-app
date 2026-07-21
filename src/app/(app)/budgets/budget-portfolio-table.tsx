"use client";

import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  consumptionBarClasses, consumptionLabel, formatMoney,
} from "@/lib/budget";
import { humanize } from "./types";
import type { ProjectBudgetRow } from "./types";

type SortKey = "project" | "type" | "amount" | "consumption" | "remaining" | "margin";

const ACCESSORS: SortAccessors<ProjectBudgetRow, SortKey> = {
  project: (r) => r.name,
  type: (r) => r.budget_type,
  amount: (r) => r.client_amount,
  consumption: (r) => r.consumption_pct,
  remaining: (r) => r.remaining,
  margin: (r) => r.margin,
};

export function BudgetPortfolioTable({
  rows,
  clientIdByName = {},
}: {
  rows: ProjectBudgetRow[];
  /** name -> client id, built server-side (the budget view carries names only). */
  clientIdByName?: Record<string, string>;
}) {
  const { rows: sorted, sort, toggle } = useSort(rows, ACCESSORS, {
    key: "consumption",
    dir: "desc",
  });
  return (
    <Table>
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          const clientId = row.client_name ? clientIdByName[row.client_name] : undefined;
          return (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/projects/${row.id}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {clientId ? (
                    <Link href={`/clients/${clientId}`} className="hover:underline">
                      {row.client_name}
                    </Link>
                  ) : (
                    (row.client_name ?? "—")
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {row.budget_type ? humanize(row.budget_type) : "—"}
              </TableCell>
              <TableCell>{formatMoney(row.client_amount)}</TableCell>
              <TableCell>
                <ConsumptionCell row={row} />
              </TableCell>
              <TableCell>{formatMoney(row.remaining)}</TableCell>
              <TableCell>
                {row.margin === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div>
                    <div>{formatMoney(row.margin)}</div>
                    {row.margin_pct !== null && (
                      <div className="text-xs text-muted-foreground">{row.margin_pct.toFixed(1)}%</div>
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ConsumptionCell({ row }: { row: ProjectBudgetRow }) {
  if (row.client_amount === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const pct = row.consumption_pct ?? 0;
  const width = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>{formatMoney(row.invoiced)}</span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={consumptionLabel(row.consumption_pct)}
      >
        <div
          className={`h-full rounded-full transition-all ${consumptionBarClasses(row.consumption_pct)}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
