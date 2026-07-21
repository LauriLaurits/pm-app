"use client";

import Link from "next/link";
import { setPersonStatusAction } from "@/app/actions/people";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DotBadge } from "@/components/dot-badge";
import { InlineEditSelect, type InlineEditOption } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { avatarTint } from "@/lib/avatar-tint";
import { humanize, initials } from "./types";
import type { PersonListRow } from "./types";
import { PersonRowActions } from "./person-row-actions";

type SortKey = "name" | "status" | "capacity";

const ACCESSORS: SortAccessors<PersonListRow, SortKey> = {
  name: (r) => r.full_name,
  // Away (on vacation now) sorts as its own state between Active and Deactivated.
  status: (r) => (r.on_vacation_now ? "away" : r.status),
  capacity: (r) => r.weekly_capacity_hours,
};

// Same pill-less dot language as the projects list status column (see STATUS_INLINE_OPTIONS in
// projects/types.ts): green Active, red Deactivated. "Away" is not a select option -- it's a
// derived vacation state rendered as a read-only DotBadge below.
const STATUS_OPTIONS: InlineEditOption[] = [
  {
    value: "active",
    label: "Active",
    badgeVariant: "outline",
    badgeClassName: "border-transparent bg-transparent px-0 font-normal text-foreground/80",
    dotClassName: "bg-emerald-500",
  },
  {
    value: "inactive",
    label: "Deactivated",
    badgeVariant: "outline",
    badgeClassName: "border-transparent bg-transparent px-0 font-normal text-foreground/80",
    dotClassName: "bg-red-500",
  },
];

export function PeopleTable({
  rows,
  canManage,
  roleTitleOptions,
  teamOptions,
}: {
  rows: PersonListRow[];
  canManage: boolean;
  roleTitleOptions: string[];
  teamOptions: string[];
}) {
  const { rows: sorted, sort, toggle } = useSort(rows, ACCESSORS, { key: "name", dir: "asc" });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Person" sortKey="name" sort={sort} onToggle={toggle} />
          <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
          <SortableHead label="Capacity (per week)" sortKey="capacity" sort={sort} onToggle={toggle} />
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
                  <div className="text-xs text-muted-foreground">
                    {[row.role_title, row.employment_type ? humanize(row.employment_type) : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <StatusCell row={row} canManage={canManage} />
            </TableCell>
            <TableCell className="text-sm">{row.weekly_capacity_hours} h</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <PersonRowActions
                  person={row}
                  roleTitleOptions={roleTitleOptions}
                  teamOptions={teamOptions}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Green Active / red Deactivated stay inline-editable; "Away" (currently on vacation) is a
// derived state, so it renders as a plain amber DotBadge instead of the select.
function StatusCell({ row, canManage }: { row: PersonListRow; canManage: boolean }) {
  if (row.on_vacation_now) return <DotBadge dotClassName="bg-amber-400">Away</DotBadge>;
  if (!row.status) return <Badge variant="outline">—</Badge>;
  return (
    <InlineEditSelect
      value={row.status}
      options={STATUS_OPTIONS}
      canEdit={canManage}
      ariaLabel={`${row.full_name} status`}
      onSave={(value) => setPersonStatusAction(row.id, value as "active" | "inactive")}
    />
  );
}
