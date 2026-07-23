import Link from "next/link";
import { PersonAvatar } from "@/components/person-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DotBadge } from "@/components/dot-badge";
import { deriveHealth } from "@/lib/health";
import {
  BudgetCell, DatesCell, HealthBadge, ProgressCell, type ProgressById,
} from "./projects-table";
import { STATUS_DOT } from "./types";
import type { ProjectListRow } from "./types";
import { PROJECT_ICONS, type ProjectIconKey } from "@/lib/project-icons";

// Card view reuses the TABLE's cell components (dates, budget, progress, health) so the two
// views can never drift apart -- same bars, same countdown colors, same derived health.
export function ProjectsCards({
  rows,
  progressById,
  iconKeys,
}: {
  rows: ProjectListRow[];
  progressById: ProgressById;
  iconKeys?: Record<string, ProjectIconKey>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        if (!row.id) return null;
        const Icon = PROJECT_ICONS[iconKeys?.[row.id] ?? "folder"].icon;
        const health = deriveHealth({
          status: row.status,
          startDate: row.start_date,
          deadline: row.deadline,
          consumptionPct:
            row.budget_total && row.budget_used !== null
              ? (row.budget_used / row.budget_total) * 100
              : null,
          progressPct: progressById[row.id]?.pct ?? null,
        });
        return (
          <Card key={row.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/25 bg-muted/30 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <CardTitle>
                    <Link href={`/projects/${row.id}`} className="transition-opacity hover:opacity-70">
                      {row.name}
                    </Link>
                  </CardTitle>
                </div>
                <HealthBadge health={health} />
              </div>
              <p className="text-sm text-muted-foreground">{row.client_name ?? "—"}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PersonAvatar name={row.pm_name} avatarUrl={row.pm_avatar_url} className="size-8" />
                  <span className="text-sm">{row.pm_name ?? "—"}</span>
                </div>
                {row.status && (
                  <DotBadge dotClassName={STATUS_DOT[row.status]}>{row.status.replace(/_/g, " ")}</DotBadge>
                )}
              </div>

              <DatesCell start={row.start_date} deadline={row.deadline} status={row.status} />

              <div>
                <p className="mb-1 text-xs font-medium text-foreground/70">Budget</p>
                <BudgetCell row={row} />
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-foreground/70">Progress</p>
                <ProgressCell progress={progressById[row.id]} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
