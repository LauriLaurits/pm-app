import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanize } from "../types";
import { formatPeriod } from "./types";
import type { TimeOffRow } from "./types";
import { TimeOffDeleteButton } from "./time-off-delete-button";
import { TimeOffDialog } from "./time-off-dialog";

/** Read-only list for everyone; when `canManage` is true (manage_people holders -- see
 * page.tsx) an "Add time off" dialog appears in the header and each row gets Edit/Delete. */
export function TimeOffCard({
  personId,
  timeOff,
  canManage = false,
}: {
  personId: string;
  timeOff: TimeOffRow[];
  canManage?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Time off</CardTitle>
        {canManage && (
          <CardAction>
            <TimeOffDialog personId={personId} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {timeOff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time off recorded.</p>
        ) : (
          <div className="space-y-2">
            {timeOff.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div>{formatPeriod(t.starts_on, t.ends_on)}</div>
                  {t.note && <div className="text-xs text-muted-foreground">{t.note}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{humanize(t.type)}</Badge>
                  {canManage && (
                    <>
                      <TimeOffDialog personId={personId} timeOff={t} />
                      <TimeOffDeleteButton personId={personId} timeOffId={t.id} />
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
