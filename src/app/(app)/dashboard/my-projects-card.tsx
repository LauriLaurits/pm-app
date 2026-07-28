import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { DotBadge } from "@/components/dot-badge";
import { deadlineCountdown } from "@/lib/deadline";
import { DERIVED_HEALTH_DOT, DERIVED_HEALTH_LABEL, healthTitle } from "@/lib/health";
import type { MyProjectRow } from "./compute";

// Compact table for "what am I responsible for right now" -- Task 2's buildMyProjects already
// picked the right candidate set (the viewer's own PM'd projects, or every active project as a
// fallback for non-PM viewers) and sorted worst-health-first; this just renders it.
export function MyProjectsCard({ rows, hasBudget }: { rows: MyProjectRow[]; hasBudget: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My projects</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" render={<Link href="/projects" />}>
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No projects to show.</p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((row) => {
                const countdown = deadlineCountdown(row.deadline, "short");
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/projects/${row.id}`} className="block truncate font-medium hover:underline">
                        {row.name}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">{row.clientName ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <DotBadge
                        dotClassName={DERIVED_HEALTH_DOT[row.health.level]}
                        title={healthTitle(row.health)}
                      >
                        {DERIVED_HEALTH_LABEL[row.health.level]}
                      </DotBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {hasBudget && row.consumptionPct !== null ? `${Math.round(row.consumptionPct)}%` : "—"}
                    </TableCell>
                    <TableCell className="min-w-20">
                      {row.progressPct === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="text-xs">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[var(--viz-series-1)]"
                              style={{ width: `${Math.min(Math.max(row.progressPct, 0), 100)}%` }}
                            />
                          </div>
                          <div className="mt-0.5 text-muted-foreground tabular-nums">{row.progressPct}%</div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`text-right text-xs tabular-nums whitespace-nowrap ${countdown.toneClass}`}>
                      {countdown.label || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
