import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/budget";
import { sumOrNull, type PartBudgetRow } from "./types";
import { PartBudgetEditDialog } from "./part-budget-edit-dialog";

// Fixed-price parts: agreed price (client_price), planned/actual cost + profit (finance-only,
// "—" otherwise), invoiced/paid/remaining. Every cell reads a column the view already null-gated
// for this viewer -- nothing here is recomputed from a separately fetched cost. The trailing
// Actions column (edit billing/cost) only renders for a manage_budget/view_internal_cost holder.
export function BudgetPartsFixed({
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

  const showActions = canManageBudget || canManageCost;
  const totalPrice = sumOrNull(parts.map((p) => p.client_price));
  const totalPlanned = sumOrNull(parts.map((p) => p.planned_internal_cost));
  const totalActual = sumOrNull(parts.map((p) => p.actual_internal_cost));
  const totalMargin = sumOrNull(parts.map((p) => p.margin));
  const totalInvoiced = sumOrNull(parts.map((p) => p.invoiced));
  const totalPaid = sumOrNull(parts.map((p) => p.paid));
  const totalRemaining = sumOrNull(parts.map((p) => p.remaining));

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Fixed-price parts</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Part</TableHead>
            <TableHead>Agreed price</TableHead>
            <TableHead>Planned cost</TableHead>
            <TableHead>Actual cost</TableHead>
            <TableHead>Profit</TableHead>
            <TableHead>Invoiced</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Remaining</TableHead>
            {showActions && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {parts.map((part) => (
            <TableRow key={part.part_id}>
              <TableCell className="font-medium">{part.part_name}</TableCell>
              <TableCell>{formatMoney(part.client_price)}</TableCell>
              <TableCell>{formatMoney(part.planned_internal_cost)}</TableCell>
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
              <TableCell>{formatMoney(part.invoiced)}</TableCell>
              <TableCell>{formatMoney(part.paid)}</TableCell>
              <TableCell>{formatMoney(part.remaining)}</TableCell>
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
            <TableCell>{formatMoney(totalPrice)}</TableCell>
            <TableCell>{formatMoney(totalPlanned)}</TableCell>
            <TableCell>{formatMoney(totalActual)}</TableCell>
            <TableCell>{formatMoney(totalMargin)}</TableCell>
            <TableCell>{formatMoney(totalInvoiced)}</TableCell>
            <TableCell>{formatMoney(totalPaid)}</TableCell>
            <TableCell>{formatMoney(totalRemaining)}</TableCell>
            {showActions && <TableCell />}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
