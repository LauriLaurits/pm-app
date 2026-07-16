import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "./types";
import type { TimeEntryWithProject } from "./types";
import { TimeEntryDeleteButton } from "./time-entry-delete-button";

/** `headerAction` (the "Log time" dialog trigger) and per-row delete are only ever passed by
 * the caller when `canManage` is true -- which page.tsx only does on the viewer's OWN person
 * page. On anyone else's page this renders as a plain read-only list, same as Task 2. */
export function RecentHoursCard({
  entries,
  canManage = false,
  headerAction,
}: {
  entries: TimeEntryWithProject[];
  canManage?: boolean;
  headerAction?: ReactNode;
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
                  {canManage && <TimeEntryDeleteButton entryId={e.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
