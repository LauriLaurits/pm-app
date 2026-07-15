import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  HEALTH_BADGE_CLASS, STATUS_BADGE, formatDate, formatMoney, humanize, initials,
} from "./types";
import type { ProjectListRow } from "./types";

export function ProjectsCards({ rows }: { rows: ProjectListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>
                <Link href={`/projects/${row.id}`} className="hover:underline">
                  {row.name}
                </Link>
              </CardTitle>
              {row.health && (
                <Badge
                  variant={row.health === "critical" ? "destructive" : "outline"}
                  className={HEALTH_BADGE_CLASS[row.health]}
                >
                  {humanize(row.health)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{row.client_name ?? "—"}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarImage src={row.pm_avatar_url ?? undefined} alt={row.pm_name ?? ""} />
                  <AvatarFallback>{initials(row.pm_name)}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{row.pm_name ?? "—"}</span>
              </div>
              {row.status && (
                <Badge variant={STATUS_BADGE[row.status]}>{humanize(row.status)}</Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              {formatDate(row.start_date)} → {formatDate(row.deadline)} · {row.member_count ?? 0}{" "}
              member{row.member_count === 1 ? "" : "s"}
            </div>

            <div>
              <Progress value={row.progress ?? 0} />
              <div className="mt-1 text-xs text-muted-foreground">{row.progress ?? 0}% complete</div>
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
      ))}
    </div>
  );
}
