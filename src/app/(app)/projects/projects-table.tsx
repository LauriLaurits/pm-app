"use client";

import { useMemo } from "react";
import Link from "next/link";
import { updateProjectFieldAction } from "@/app/actions/projects";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { InlineEditSelect } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { consumptionBarClasses } from "@/lib/budget";
import { avatarTint } from "@/lib/avatar-tint";
import { deadlineCountdown } from "@/lib/deadline";
import {
  HEALTH_INLINE_OPTIONS, PRIORITY_INLINE_OPTIONS, STATUS_INLINE_OPTIONS,
  formatDate, formatMoney, humanize, initials,
} from "./types";
import type { ProjectListRow } from "./types";

/** Server-built cross-link targets per project (the list view lacks these ids). Either id may be
 * missing (no client set / PM without a people row) -- the cell falls back to plain text. */
export type ProjectRowLinks = Record<
  string,
  { clientId: string | null; pmPersonId: string | null }
>;

const HEALTH_RANK = { healthy: 0, warning: 1, critical: 2 } as const;

function consumptionPct(row: ProjectListRow): number | null {
  if (row.budget_total === null || row.budget_total === 0 || row.budget_used === null) return null;
  return (row.budget_used / row.budget_total) * 100;
}

type SortKey =
  | "name" | "client" | "pm" | "status" | "health" | "deadline"
  | "team" | "budget" | "progress" | "updated";

const ACCESSORS: SortAccessors<ProjectListRow, SortKey> = {
  name: (r) => r.name,
  client: (r) => r.client_name,
  pm: (r) => r.pm_name,
  status: (r) => r.status,
  health: (r) => (r.health ? HEALTH_RANK[r.health] : null),
  deadline: (r) => r.deadline,
  team: (r) => r.member_count,
  budget: (r) => consumptionPct(r),
  progress: (r) => r.progress,
  updated: (r) => r.updated_at,
};

export function ProjectsTable({
  rows,
  editableProjectIds,
  links,
}: {
  rows: ProjectListRow[];
  /** Projects this viewer holds edit_project on -- computed server-side in page.tsx (same UX-
   * gating-only convention as every other page: the real boundary is requirePermission inside
   * updateProjectFieldAction, re-checked regardless of what's rendered here). Array (not Set)
   * because this is now a client component and props must serialize. */
  editableProjectIds: string[];
  links: ProjectRowLinks;
}) {
  const editable = useMemo(() => new Set(editableProjectIds), [editableProjectIds]);
  const { rows: sorted, sort, toggle } = useSort(rows, ACCESSORS, {
    key: "updated",
    dir: "desc",
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Project" sortKey="name" sort={sort} onToggle={toggle} />
          <SortableHead label="Client" sortKey="client" sort={sort} onToggle={toggle} />
          <SortableHead label="PM" sortKey="pm" sort={sort} onToggle={toggle} />
          <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
          <SortableHead label="Health" sortKey="health" sort={sort} onToggle={toggle} />
          <SortableHead label="Deadline" sortKey="deadline" sort={sort} onToggle={toggle} />
          <SortableHead label="Team" sortKey="team" sort={sort} onToggle={toggle} />
          <SortableHead label="Budget" sortKey="budget" sort={sort} onToggle={toggle} />
          <SortableHead label="Progress" sortKey="progress" sort={sort} onToggle={toggle} />
          <SortableHead label="Updated" sortKey="updated" sort={sort} onToggle={toggle} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          // project_list_rows is a plain view, so every column's type is nullable even though
          // `id` is never actually null in practice (it's the projects table's PK) -- guard so
          // the rest of this row can treat it as a plain string.
          if (!row.id) return null;
          const projectId = row.id;
          const canEdit = editable.has(projectId);
          const rowLinks = links[projectId];
          const countdown = deadlineCountdown(row.deadline, "short");
          return (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/projects/${row.id}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                {row.priority && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <InlineEditSelect
                      value={row.priority}
                      options={PRIORITY_INLINE_OPTIONS}
                      canEdit={canEdit}
                      ariaLabel="project priority"
                      onSave={updateProjectFieldAction.bind(null, projectId, "priority")}
                    />
                    <span>priority</span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                {row.client_name && rowLinks?.clientId ? (
                  <Link href={`/clients/${rowLinks.clientId}`} className="hover:underline">
                    {row.client_name}
                  </Link>
                ) : (
                  (row.client_name ?? "—")
                )}
              </TableCell>
              <TableCell>
                <PersonCell
                  name={row.pm_name}
                  avatarUrl={row.pm_avatar_url}
                  personId={rowLinks?.pmPersonId ?? null}
                />
              </TableCell>
              <TableCell>
                {row.status && (
                  <InlineEditSelect
                    value={row.status}
                    options={STATUS_INLINE_OPTIONS}
                    canEdit={canEdit}
                    ariaLabel="project status"
                    onSave={updateProjectFieldAction.bind(null, projectId, "status")}
                  />
                )}
              </TableCell>
              <TableCell>
                {row.health && (
                  <InlineEditSelect
                    value={row.health}
                    options={HEALTH_INLINE_OPTIONS}
                    canEdit={canEdit}
                    ariaLabel="project health"
                    onSave={updateProjectFieldAction.bind(null, projectId, "health")}
                  />
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm">{formatDate(row.deadline)}</div>
                {countdown.label && (
                  <div className={`text-xs ${countdown.toneClass}`}>{countdown.label}</div>
                )}
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
          );
        })}
      </TableBody>
    </Table>
  );
}

function PersonCell({
  name,
  avatarUrl,
  personId,
}: {
  name: string | null;
  avatarUrl: string | null;
  personId: string | null;
}) {
  const inner = (
    <span className="flex items-center gap-2">
      <Avatar size="sm">
        <AvatarImage src={avatarUrl ?? undefined} alt={name ?? ""} />
        <AvatarFallback className={avatarTint(name)}>{initials(name)}</AvatarFallback>
      </Avatar>
      <span>{name ?? "—"}</span>
    </span>
  );
  if (!personId || !name) return inner;
  return (
    <Link href={`/people/${personId}`} className="hover:underline">
      {inner}
    </Link>
  );
}

// Same consumption language as /budgets (ConsumptionCell there): used-of-total, % with a
// severity-colored mini bar, remaining underneath. The list and the portfolio must agree.
function BudgetCell({ row }: { row: ProjectListRow }) {
  const pct = consumptionPct(row);
  return (
    <div className="min-w-28 text-xs">
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">{formatMoney(row.budget_used)}</span>
        {" of "}
        {formatMoney(row.budget_total)}
        <span className="ml-1">· {humanize(row.budget_type ?? "")}</span>
      </div>
      {pct !== null && (
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${consumptionBarClasses(pct)}`}
              style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
            />
          </div>
          <span className="text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="mt-0.5 text-muted-foreground">rem. {formatMoney(row.budget_remaining)}</div>
    </div>
  );
}
