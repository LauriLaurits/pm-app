import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";
import { monthLabel, type MonthlyBreakdownRow } from "./types";

// Monthly cost breakdown. The planned-cost/actual-cost columns only render when at least one
// month has a non-zero value in them -- which only happens if the viewer has view_internal_cost
// (budget_items RLS withholds those rows entirely otherwise), so a non-finance viewer simply
// gets the client-tier columns rather than two columns of zeros implying "no internal cost".
export function BudgetMonthlyTable({ rows }: { rows: MonthlyBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No budget activity recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  const hasCostData = rows.some((r) => r.plannedCost !== 0 || r.actualCost !== 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly breakdown</CardTitle>
        <CardDescription>Budget activity grouped by month</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Invoiced</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Changes</TableHead>
              {hasCostData && (
                <>
                  <TableHead>Planned cost</TableHead>
                  <TableHead>Actual cost</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.month}>
                <TableCell className="font-medium">{monthLabel(row.month)}</TableCell>
                <TableCell>{formatMoney(row.invoice)}</TableCell>
                <TableCell>{formatMoney(row.payment)}</TableCell>
                <TableCell>{row.change === 0 ? "—" : formatMoney(row.change)}</TableCell>
                {hasCostData && (
                  <>
                    <TableCell>{formatMoney(row.plannedCost)}</TableCell>
                    <TableCell>{formatMoney(row.actualCost)}</TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
