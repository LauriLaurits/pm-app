import { AlertTriangleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  CONSUMPTION_LABEL,
  consumptionBarClasses,
  consumptionBadgeClasses,
  consumptionSeverity,
  formatMoney,
} from "@/lib/budget";
import type { ProjectBudgetRow } from "./types";

// Project-level summary: client-tier cards render whenever `client_amount` is visible (view_budget);
// the finance-tier cards (internal cost + margin) only render when `margin` is visible too (both
// view_budget AND view_internal_cost) -- straight off the security_invoker view, never re-derived.
export function BudgetSummary({ row }: { row: ProjectBudgetRow }) {
  const hasClientVisibility = row.client_amount !== null;
  const hasFinanceVisibility = row.margin !== null;
  const severity = consumptionSeverity(row.consumption_pct);

  return (
    <div className="space-y-3">
      {hasClientVisibility && severity !== "ok" && (
        <Alert
          variant={severity === "over" ? "destructive" : "default"}
          className={consumptionBadgeClasses(row.consumption_pct)}
        >
          <AlertTriangleIcon />
          <AlertTitle>{CONSUMPTION_LABEL[severity]}</AlertTitle>
          <AlertDescription>
            {formatMoney(row.invoiced)} invoiced of {formatMoney(row.client_amount)}
            {" "}({(row.consumption_pct ?? 0).toFixed(0)}% consumed).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Client amount" value={formatMoney(row.client_amount)} />
        <SummaryCard label="Invoiced" value={formatMoney(row.invoiced)} />
        <SummaryCard label="Paid" value={formatMoney(row.paid)} />
        <SummaryCard label="Remaining" value={formatMoney(row.remaining)} />
        {hasFinanceVisibility && (
          <>
            <SummaryCard label="Internal cost" value={formatMoney(row.internal_cost)} />
            <SummaryCard
              label="Margin"
              value={formatMoney(row.margin)}
              sub={row.margin_pct === null ? undefined : `${row.margin_pct.toFixed(1)}%`}
            />
          </>
        )}
      </div>

      {hasClientVisibility && (
        <Card size="sm">
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <CardDescription>Consumption</CardDescription>
              <span className="text-muted-foreground">{(row.consumption_pct ?? 0).toFixed(0)}%</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={row.consumption_pct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={CONSUMPTION_LABEL[severity]}
            >
              <div
                className={`h-full rounded-full transition-all ${consumptionBarClasses(row.consumption_pct)}`}
                style={{ width: `${Math.min(Math.max(row.consumption_pct ?? 0, 0), 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl font-semibold">
          {value}
          {sub && <span className="ml-2 text-sm font-normal text-muted-foreground">{sub}</span>}
        </CardTitle>
      </CardContent>
    </Card>
  );
}
