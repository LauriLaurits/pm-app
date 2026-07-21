import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { avatarTint } from "@/lib/avatar-tint";
import { Badge } from "@/components/ui/badge";
import { DotBadge } from "@/components/dot-badge";
import { DERIVED_HEALTH_BADGE_CLASS, DERIVED_HEALTH_LABEL, deriveHealth, healthTitle } from "@/lib/health";
import {
  STATUS_DOT, formatDate, formatMoney, humanize, initials,
} from "./types";
import type { ProjectListRow } from "./types";

export function ProjectsCards({ rows }: { rows: ProjectListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        // Same derived health as the table/detail header (no parts data in card view, so the
        // progress-lag signal is simply absent here -- deadline + budget still apply).
        const health = deriveHealth({
          status: row.status,
          startDate: row.start_date,
          deadline: row.deadline,
          consumptionPct:
            row.budget_total && row.budget_used !== null
              ? (row.budget_used / row.budget_total) * 100
              : null,
          progressPct: null,
        });
        return (
          <Card key={row.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>
                  <Link href={`/projects/${row.id}`} className="hover:underline">
                    {row.name}
                  </Link>
                </CardTitle>
                <Badge
                  variant="outline"
                  className={DERIVED_HEALTH_BADGE_CLASS[health.level]}
                  title={healthTitle(health)}
                >
                  {DERIVED_HEALTH_LABEL[health.level]}
                </Badge>
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
                  <DotBadge dotClassName={STATUS_DOT[row.status]}>{humanize(row.status)}</DotBadge>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {formatDate(row.start_date)} → {formatDate(row.deadline)} · {row.member_count ?? 0}{" "}
                member{row.member_count === 1 ? "" : "s"}
              </div>

              <div className="rounded-lg bg-muted/50 p-2 text-xs">
                <div className="font-medium text-foreground">{humanize(row.budget_type ?? "")} budget</div>
                <div className="text-muted-foreground">
                  {formatMoney(row.budget_used)} used of {formatMoney(row.budget_total)}
                </div>
                <div className="text-muted-foreground">{formatMoney(row.budget_remaining)} remaining</div>
              </div>

              <div className="text-right text-xs text-muted-foreground">
                Updated {formatDate(row.updated_at)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
