import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "./types";
import type { TimeEntryWithProject } from "./types";

export function RecentHoursCard({ entries }: { entries: TimeEntryWithProject[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent logged hours</CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled
            title="Time logging is coming in a moment."
          >
            Log time
          </Button>
        </CardAction>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
