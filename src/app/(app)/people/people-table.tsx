"use client";

import Link from "next/link";
import { setPersonStatusAction } from "@/app/actions/people";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { InlineEditSelect, type InlineEditOption } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { avatarTint } from "@/lib/avatar-tint";
import { utilizationBadgeClasses, utilizationLabel } from "@/lib/workload";
import { formatMoney, humanize, initials } from "./types";
import type { PersonListRow } from "./types";
import { PersonRowActions } from "./person-row-actions";

type SortKey =
  | "name" | "department" | "type" | "status" | "capacity"
  | "allocation" | "availability" | "projects" | "cost" | "billing";

const ACCESSORS: SortAccessors<PersonListRow, SortKey> = {
  name: (r) => r.full_name,
  department: (r) => r.department,
  type: (r) => r.employment_type,
  status: (r) => r.status,
  capacity: (r) => r.weekly_capacity_hours,
  allocation: (r) => r.current_allocation_pct,
  // Vacation sorts before everyone, then least-loaded first -- "who can take work" order.
  availability: (r) => (r.on_vacation_now ? -1 : (r.current_allocation_pct ?? 0)),
  projects: (r) => r.active_project_count,
  cost: (r) => r.internal_cost,
  billing: (r) => r.billing_rate,
};

const STATUS_OPTIONS: InlineEditOption[] = [
  { value: "active", label: "active", badgeVariant: "outline" },
  { value: "inactive", label: "inactive", badgeVariant: "secondary" },
];

export function PeopleTable({ rows, canManage }: { rows: PersonListRow[]; canManage: boolean }) {
  const { rows: sorted, sort, toggle } = useSort(rows, ACCESSORS, { key: "name", dir: "asc" });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Person" sortKey="name" sort={sort} onToggle={toggle} />
          <SortableHead label="Department" sortKey="department" sort={sort} onToggle={toggle} />
          <SortableHead label="Type" sortKey="type" sort={sort} onToggle={toggle} />
          <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
          <SortableHead label="Capacity" sortKey="capacity" sort={sort} onToggle={toggle} />
          <SortableHead label="Allocation" sortKey="allocation" sort={sort} onToggle={toggle} />
          <SortableHead label="Availability" sortKey="availability" sort={sort} onToggle={toggle} />
          <SortableHead label="Projects" sortKey="projects" sort={sort} onToggle={toggle} />
          <SortableHead label="Cost" sortKey="cost" sort={sort} onToggle={toggle} />
          <SortableHead label="Billing" sortKey="billing" sort={sort} onToggle={toggle} />
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarImage src={row.avatar_url ?? undefined} alt={row.full_name ?? ""} />
                  <AvatarFallback className={avatarTint(row.full_name)}>
                    {initials(row.full_name)}
                  </AvatarFallback>
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
              {row.status ? (
                <InlineEditSelect
                  value={row.status}
                  options={STATUS_OPTIONS}
                  canEdit={canManage}
                  ariaLabel={`${row.full_name} status`}
                  onSave={(value) => setPersonStatusAction(row.id, value as "active" | "inactive")}
                />
              ) : (
                <Badge variant="outline">—</Badge>
              )}
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

// Same color language as the Allocation badge next door (utilization classes), so the two
// columns visibly agree: green Available, blue Partial, amber Full, red Overallocated.
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
  const pct = row.current_allocation_pct ?? 0;
  return (
    <Badge variant="outline" className={utilizationBadgeClasses(pct)}>
      {utilizationLabel(pct)}
    </Badge>
  );
}
