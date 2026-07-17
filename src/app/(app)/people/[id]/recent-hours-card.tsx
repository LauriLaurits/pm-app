import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "./types";
import type { AssignedProjectOption, PartOption, TimeEntryWithProject } from "./types";
import { TimeEntryDeleteButton } from "./time-entry-delete-button";
import { TimeEntryEditDialog } from "./time-entry-edit-dialog";

/** `headerAction` (the "Log time" dialog trigger) and per-row edit/delete are only ever passed
 * by the caller when `canManage` is true -- which page.tsx only does on the viewer's OWN person
 * page. On anyone else's page this renders as a plain read-only list, same as Task 2.
 * `projects`/`partsByProject` (needed by the edit dialog's project/part pickers) are only ever
 * passed alongside canManage for the same reason. */
export function RecentHoursCard({
  entries,
  canManage = false,
  headerAction,
  projects = [],
  partsByProject = {},
}: {
  entries: TimeEntryWithProject[];
  canManage?: boolean;
  headerAction?: ReactNode;
  projects?: AssignedProjectOption[];
  partsByProject?: Record<string, PartOption[]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent logged hours</CardTitle>
        {headerAction && <CardAction>{headerAction}</CardAction>}
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{e.project_name ?? "Untitled project"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(e.entry_date)}
                    {e.description ? ` · ${e.description}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!e.billable && <Badge variant="ghost">Non-billable</Badge>}
                  <span className="font-medium">{e.hours}h</span>
                  {canManage && (
                    <>
                      <TimeEntryEditDialog entry={e} projects={projects} partsByProject={partsByProject} />
                      <TimeEntryDeleteButton entryId={e.id} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
