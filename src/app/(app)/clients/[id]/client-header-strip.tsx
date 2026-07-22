import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";

// The "where does this client stand right now" strip under the client title -- same labeled-cell
// anatomy as the project detail's ProjectHeaderStrip (projects/[id]/project-header.tsx). Purely
// presentational; every number is computed server-side from RLS-scoped reads in page.tsx.
export function ClientHeaderStrip({
  projects,
  budget,
  contacts,
  pmNames,
}: {
  projects: { total: number; active: number; completed: number };
  /** null when this viewer can't see any budget numbers (project_list_rows RLS nulls them) --
   * the cell is simply omitted, same convention as the project header's Budget cell. */
  budget: { total: number; projectCount: number } | null;
  contacts: { count: number; primaryName: string | null };
  pmNames: string[];
}) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Cell
            label="Projects"
            value={`${projects.total} total`}
            context={`${projects.active} active · ${projects.completed} completed`}
          />

          {budget && (
            <Cell
              label="Budget"
              value={formatMoney(budget.total)}
              context={`across ${budget.projectCount} project${budget.projectCount === 1 ? "" : "s"}`}
            />
          )}

          <Cell
            label="Contacts"
            value={String(contacts.count)}
            context={contacts.primaryName ?? "—"}
          />

          <Cell
            label="Project managers"
            value={String(pmNames.length)}
            context={pmNames.length > 0 ? pmNames.join(", ") : "—"}
            contextClass="truncate text-muted-foreground"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({
  label,
  value,
  context,
  contextClass = "text-muted-foreground",
}: {
  label: string;
  value: string;
  context: string;
  contextClass?: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div className={`text-xs ${contextClass}`} title={context}>{context}</div>
    </div>
  );
}
