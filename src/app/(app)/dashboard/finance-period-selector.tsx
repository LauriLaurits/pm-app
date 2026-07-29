import Link from "next/link";
import { cn } from "@/lib/utils";

export const FIN_MONTH_OPTIONS = ["this", "last"] as const;
export type FinMonth = (typeof FIN_MONTH_OPTIONS)[number];

const FIN_MONTH_LABEL: Record<FinMonth, string> = { this: "This month", last: "Last month" };

// Segmented control for the finance card's invoiced-month scope -- same server-round-trip link
// pattern as the reports page's PeriodSelector (src/app/(app)/reports/period-selector.tsx):
// ?finMonth=this|last re-scopes fetchMonthInvoiceTotal server-side via financeMonthRange
// (src/lib/dashboard.ts). Server component, no client JS.
export function FinanceMonthSelector({ active }: { active: FinMonth }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted/60 p-0.5" role="group" aria-label="Invoiced month">
      {FIN_MONTH_OPTIONS.map((m) => {
        const on = m === active;
        return (
          <Link
            key={m}
            href={`/dashboard?finMonth=${m}`}
            aria-current={on ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm font-medium transition",
              on ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {FIN_MONTH_LABEL[m]}
          </Link>
        );
      })}
    </div>
  );
}
