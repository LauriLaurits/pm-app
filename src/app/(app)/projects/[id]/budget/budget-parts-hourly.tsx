import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/budget";
import { sumOrNull, type PartBudgetRow } from "./types";
import { PartBudgetEditDialog } from "./part-budget-edit-dialog";

// Hourly parts: rate, estimated vs logged hours, client amount, internal cost + margin
// (finance-only, "—" otherwise). Hours come straight off the view's logged_hours/billable_hours
// (already RLS-scoped via time_entries), never recomputed here. The trailing Actions column
// (edit billing/cost) only renders for a manage_budget/view_internal_cost holder.
export function BudgetPartsHourly({
  projectId,
  parts,
  canManageBudget,
  canManageCost,
}: {
  projectId: string;
  parts: PartBudgetRow[];
  canManageBudget: boolean;
  canManageCost: boolean;
}) {
  if (parts.length === 0) return null;

  // Hours are summed floats (0.1-precision entries), so display rounds to one decimal to avoid
  // artifacts like 175.39999999999998.
  const fmtHours = (h: number) => String(Math.round(h * 10) / 10);

  const showActions = canManageBudget || canManageCost;
  const totalEstimated = sumOrNull(parts.map((p) => p.estimated_hours));
  const totalLogged = sumOrNull(parts.map((p) => p.logged_hours));
  const totalClient = sumOrNull(parts.map((p) => p.client_price));
  const totalCost = sumOrNull(parts.map((p) => p.actual_internal_cost));
  const totalMargin = sumOrNull(parts.map((p) => p.margin));

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Hourly parts</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Part</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Est. hours</TableHead>
            <TableHead>Logged hours</TableHead>
            <TableHead>Client amount</TableHead>
            <TableHead>Internal cost</TableHead>
            <TableHead>Margin</TableHead>
            {showActions && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {parts.map((part) => (
            <TableRow key={part.part_id}>
              <TableCell className="font-medium">{part.part_name}</TableCell>
              <TableCell>{part.hourly_rate === null ? "—" : formatMoney(part.hourly_rate)}</TableCell>
              <TableCell>{part.estimated_hours ?? "—"}</TableCell>
              <TableCell>
                {fmtHours(part.logged_hours ?? 0)}
                {part.billable_hours !== null && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({fmtHours(part.billable_hours)} billable)
                  </span>
                )}
              </TableCell>
              <TableCell>{formatMoney(part.client_price)}</TableCell>
              <TableCell>{formatMoney(part.actual_internal_cost)}</TableCell>
              <TableCell>
                {part.margin === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    {formatMoney(part.margin)}
                    {part.margin_pct !== null && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({part.margin_pct.toFixed(1)}%)
                      </span>
                    )}
                  </>
                )}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <PartBudgetEditDialog
                    projectId={projectId}
                    part={part}
                    canManageBudget={canManageBudget}
                    canManageCost={canManageCost}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell>—</TableCell>
            <TableCell>{totalEstimated ?? "—"}</TableCell>
            <TableCell>{fmtHours(totalLogged ?? 0)}</TableCell>
            <TableCell>{formatMoney(totalClient)}</TableCell>
            <TableCell>{formatMoney(totalCost)}</TableCell>
            <TableCell>{formatMoney(totalMargin)}</TableCell>
            {showActions && <TableCell />}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
