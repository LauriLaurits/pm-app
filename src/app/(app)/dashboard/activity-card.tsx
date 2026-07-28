import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/relative-time";
import { humanizeAction, truncate, type AuditLogRow } from "../activity/types";
import type { RecentStatusUpdate } from "./queries";

// Two mutually-exclusive feeds depending on what the viewer is allowed to see (page.tsx decides
// which one to fetch, gated on the `view_audit` permission -- never both).
export type ActivityData =
  | { kind: "audit"; rows: AuditLogRow[] }
  | { kind: "status"; rows: RecentStatusUpdate[] };

const STATUS_TEXT_MAX = 60;

// "bella.pm@pmcms.local" -> "bella.pm" -- the local part of the address, not a real display name
// (audit_logs only ever stores the email, no join to a person/profile).
function actorNamePart(email: string | null): string {
  if (!email) return "Someone";
  const [namePart] = email.split("@");
  return namePart || email;
}

// Recent activity, admin-scoped feed for view_audit holders (last 6 audit_logs rows) or a
// fallback for everyone else (last 6 status-update excerpts) -- page.tsx fetches exactly one of
// the two, gated on the same has_permission check /activity itself enforces.
export function ActivityCard({ data }: { data: ActivityData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        {data.kind === "audit" && (
          <CardAction>
            <Button variant="outline" size="sm" render={<Link href="/activity" />}>
              View all
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {data.rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No recent activity.</p>
        ) : data.kind === "audit" ? (
          <ul className="space-y-3">
            {data.rows.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{actorNamePart(row.actor_email)}</span>{" "}
                  <span className="text-muted-foreground">{humanizeAction(row.action)}</span>
                </span>
                <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                  {formatRelativeTime(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="-mx-2">
            {data.rows.map((row, i) => (
              <li key={`${row.projectId}-${row.field}-${row.createdAt}-${i}`}>
                <Link
                  href={`/projects/${row.projectId}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{row.projectName ?? "Untitled project"}:</span>{" "}
                    <span className="text-muted-foreground">{truncate(row.text, STATUS_TEXT_MAX)}</span>
                  </span>
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {formatRelativeTime(row.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
