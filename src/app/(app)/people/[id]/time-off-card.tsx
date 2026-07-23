import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanize } from "../types";
import { formatPeriod } from "./types";
import type { TimeOffRow } from "./types";
import { TimeOffDeleteButton } from "./time-off-delete-button";
import { TimeOffDialog } from "./time-off-dialog";

/** Read-only list for everyone; when `canManage` is true (manage_people holders -- see
 * page.tsx) an "Add time off" dialog appears in the header and each upcoming row gets
 * Edit/Delete. Split into what still matters for planning (current + upcoming, `today` is the
 * caller's UTC date) vs. history, which collapses to a single count line so an empty or
 * long-tenured card never grows a wall of stale rows. */
export function TimeOffCard({
  personId,
  timeOff,
  today,
  canManage = false,
}: {
  personId: string;
  timeOff: TimeOffRow[];
  today: string;
  canManage?: boolean;
}) {
  // "Upcoming" includes an absence in progress (ends_on >= today) -- a PM planning next week
  // cares that Bella is away NOW, not only about entries that haven't started yet.
  const upcoming = timeOff
    .filter((t) => t.ends_on >= today)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const past = timeOff.filter((t) => t.ends_on < today);

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
      <CardContent className="space-y-3">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time off scheduled.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((t) => (
              <div key={t.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium capitalize">{humanize(t.type)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatPeriod(t.starts_on, t.ends_on)} · {durationDays(t.starts_on, t.ends_on)} days
                    </div>
                    {t.note && <div className="mt-1 truncate text-xs text-muted-foreground">{t.note}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{leaveStatus(t, today)}</Badge>
                    {canManage && (
                      <>
                        <TimeOffDialog personId={personId} timeOff={t} />
                        <TimeOffDeleteButton personId={personId} timeOffId={t.id} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {past.length > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {past.length} past entr{past.length === 1 ? "y" : "ies"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function leaveStatus(timeOff: TimeOffRow, today: string) {
  if (timeOff.starts_on <= today && timeOff.ends_on >= today) return "In progress";
  return timeOff.starts_on > today ? "Scheduled" : "Completed";
}

function durationDays(start: string, end: string) {
  const day = 86_400_000;
  return Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / day) + 1);
}
