import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  HEALTH_BADGE_CLASS, STATUS_BADGE, formatDate, formatMoney, humanize, initials,
} from "./types";
import type { ProjectListRow } from "./types";

export function ProjectsTable({ rows }: { rows: ProjectListRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>PM</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Health</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Budget</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/projects/${row.id}`} className="font-medium hover:underline">
                {row.name}
              </Link>
              <div className="text-xs text-muted-foreground">{humanize(row.priority ?? "")} priority</div>
            </TableCell>
            <TableCell>{row.client_name ?? "—"}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarImage src={row.pm_avatar_url ?? undefined} alt={row.pm_name ?? ""} />
                  <AvatarFallback>{initials(row.pm_name)}</AvatarFallback>
                </Avatar>
                <span>{row.pm_name ?? "—"}</span>
              </div>
            </TableCell>
            <TableCell>
              {row.status && (
                <Badge variant={STATUS_BADGE[row.status]}>{humanize(row.status)}</Badge>
              )}
            </TableCell>
            <TableCell>
              {row.health && (
                <Badge
                  variant={row.health === "critical" ? "destructive" : "outline"}
                  className={HEALTH_BADGE_CLASS[row.health]}
                >
                  {humanize(row.health)}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(row.start_date)} → {formatDate(row.deadline)}
            </TableCell>
            <TableCell>{row.member_count ?? 0}</TableCell>
            <TableCell>
              <BudgetCell row={row} />
            </TableCell>
            <TableCell className="w-32">
              <Progress value={row.progress ?? 0} />
              <div className="text-xs text-muted-foreground">{row.progress ?? 0}%</div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(row.updated_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BudgetCell({ row }: { row: ProjectListRow }) {
  return (
    <div className="text-xs">
      <div className="font-medium text-foreground">{humanize(row.budget_type ?? "")}</div>
      <div className="text-muted-foreground">
        {formatMoney(row.budget_used)} / {formatMoney(row.budget_total)}
      </div>
      <div className="text-muted-foreground">rem. {formatMoney(row.budget_remaining)}</div>
    </div>
  );
}
