import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "../types";
import type { PersonWorkloadRow } from "../types";

// Rendered ONLY when the caller's `person_workload_rows` read already came back with non-null
// cost/rate -- that view is `security_invoker` and its LEFT JOIN onto `rates` is gated by
// `rates`' own "finance reads rates" RLS policy (view_internal_cost). A non-finance caller's
// row has these columns as null, and the parent page skips rendering this card entirely rather
// than showing an empty/"—" placeholder section. This component never queries `rates` itself.
export function FinancialsCard({ person }: { person: PersonWorkloadRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financials</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Internal cost</span>
          <span className="font-medium">{formatMoney(person.internal_cost)}</span>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Billing rate</span>
          <span className="font-medium">{formatMoney(person.billing_rate)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Visible to finance only.</p>
      </CardContent>
    </Card>
  );
}
