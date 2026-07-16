import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  consumptionBarClasses, consumptionLabel, formatMoney,
} from "@/lib/budget";
import { humanize } from "./types";
import type { ProjectBudgetRow } from "./types";

export function BudgetPortfolioTable({ rows }: { rows: ProjectBudgetRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Client amount</TableHead>
          <TableHead className="w-48">Invoiced / consumption</TableHead>
          <TableHead>Remaining</TableHead>
          <TableHead>Margin</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/projects/${row.id}`} className="font-medium hover:underline">
                {row.name}
              </Link>
              <div className="text-xs text-muted-foreground">{row.client_name ?? "—"}</div>
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
        ))}
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
