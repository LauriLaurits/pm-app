import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, humanizeAction } from "../../activity/types";
import type { ActivityItem } from "./types";

/** Audit trail touching this person -- rendered by page.tsx ONLY when the audit_logs read came
 * back non-empty ("audit admin read" RLS: view_audit holders see rows, everyone else silently
 * gets none, so the card simply never mounts for them). Reuses the Activity page's action
 * humanizer so the wording matches the full audit viewer. */
export function RecentActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{humanizeAction(item.action)}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDateTime(item.created_at)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
