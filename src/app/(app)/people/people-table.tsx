import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { utilizationBadgeClasses, utilizationLabel } from "@/lib/workload";
import { formatMoney, humanize, initials } from "./types";
import type { PersonListRow } from "./types";
import { PersonRowActions } from "./person-row-actions";

export function PeopleTable({ rows, canManage }: { rows: PersonListRow[]; canManage: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Person</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead>Allocation</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead>Projects</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Billing</TableHead>
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarImage src={row.avatar_url ?? undefined} alt={row.full_name ?? ""} />
                  <AvatarFallback>{initials(row.full_name)}</AvatarFallback>
                </Avatar>
                <div>
                  <Link href={`/people/${row.id}`} className="font-medium hover:underline">
                    {row.full_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{row.role_title ?? "—"}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>{row.department ?? "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.employment_type ? humanize(row.employment_type) : "—"}
            </TableCell>
            <TableCell>
              <Badge variant={row.status === "inactive" ? "secondary" : "outline"}>
                {row.status ? humanize(row.status) : "—"}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">{row.weekly_capacity_hours}h/wk</TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={utilizationBadgeClasses(row.current_allocation_pct ?? 0)}
              >
                {row.current_allocation_pct ?? 0}%
              </Badge>
            </TableCell>
            <TableCell>
              <AvailabilityCell row={row} />
            </TableCell>
            <TableCell className="text-center">{row.active_project_count ?? 0}</TableCell>
            <TableCell className="text-sm">{formatMoney(row.internal_cost)}</TableCell>
            <TableCell className="text-sm">{formatMoney(row.billing_rate)}</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <PersonRowActions person={row} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AvailabilityCell({ row }: { row: PersonListRow }) {
  if (row.on_vacation_now) {
    return (
      <Badge
        variant="outline"
        className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
      >
        On vacation
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">{utilizationLabel(row.current_allocation_pct ?? 0)}</span>;
}
