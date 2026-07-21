import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { avatarTint } from "@/lib/avatar-tint";
import { DotBadge } from "@/components/dot-badge";
import { deriveHealth } from "@/lib/health";
import {
  BudgetCell, DatesCell, HealthBadge, ProgressCell, type ProgressById,
} from "./projects-table";
import { STATUS_DOT, initials } from "./types";
import type { ProjectListRow } from "./types";

// Card view reuses the TABLE's cell components (dates, budget, progress, health) so the two
// views can never drift apart -- same bars, same countdown colors, same derived health.
export function ProjectsCards({
  rows,
  progressById,
}: {
  rows: ProjectListRow[];
  progressById: ProgressById;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        if (!row.id) return null;
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
                <CardTitle>
                  <Link href={`/projects/${row.id}`} className="transition-opacity hover:opacity-70">
                    {row.name}
                  </Link>
                </CardTitle>
                <HealthBadge health={health} />
              </div>
              <p className="text-sm text-muted-foreground">{row.client_name ?? "—"}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarImage src={row.pm_avatar_url ?? undefined} alt={row.pm_name ?? ""} />
                    <AvatarFallback className={avatarTint(row.pm_name)}>
                      {initials(row.pm_name)}
                    </AvatarFallback>
                  </Avatar>
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
