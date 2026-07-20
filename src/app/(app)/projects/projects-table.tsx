import Link from "next/link";
import { updateProjectFieldAction } from "@/app/actions/projects";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { InlineEditSelect } from "@/components/inline-edit-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  HEALTH_INLINE_OPTIONS, PRIORITY_INLINE_OPTIONS, STATUS_INLINE_OPTIONS,
  formatDate, formatMoney, humanize, initials,
} from "./types";
import type { ProjectListRow } from "./types";

export function ProjectsTable({
  rows,
  editableProjectIds,
}: {
  rows: ProjectListRow[];
  /** Projects this viewer holds edit_project on -- computed server-side in page.tsx (same UX-
   * gating-only convention as every other page: the real boundary is requirePermission inside
   * updateProjectFieldAction, re-checked regardless of what's rendered here). */
  editableProjectIds: Set<string>;
}) {
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
        {rows.map((row) => {
          // project_list_rows is a plain view, so every column's type is nullable even though
          // `id` is never actually null in practice (it's the projects table's PK) -- guard so
          // the rest of this row can treat it as a plain string.
          if (!row.id) return null;
          const projectId = row.id;
          const canEdit = editableProjectIds.has(projectId);
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
          );
        })}
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
