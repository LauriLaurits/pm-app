import Link from "next/link";
import {
  Activity,
  KeyRound,
  LogIn,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/relative-time";
import { categoryOf, humanizeAction, truncate, type ActionCategory, type AuditLogRow } from "../activity/types";
import type { RecentStatusUpdate } from "./queries";

// Two mutually-exclusive feeds depending on what the viewer is allowed to see (page.tsx decides
// which one to fetch, gated on the `view_audit` permission -- never both).
export type ActivityData =
  | { kind: "audit"; rows: AuditLogRow[] }
  | { kind: "status"; rows: RecentStatusUpdate[] };

const STATUS_TEXT_MAX = 60;

// One leading icon per row, keyed by the same coarse category the /activity list's colored tag
// uses (categoryOf, activity/types.ts) -- a new AuditAction picks up a sensible icon for free, same
// reasoning as that module's own comment.
const CATEGORY_ICON: Record<ActionCategory, LucideIcon> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  reveal: KeyRound,
  auth: LogIn,
  other: Activity,
};

function ActivityIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60">
      <Icon className="size-3.5 text-muted-foreground" />
    </span>
  );
}

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
        <CardTitle className="text-base font-semibold">Recent activity</CardTitle>
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
          <ul className="-mx-2">
            {data.rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm">
                <ActivityIcon icon={CATEGORY_ICON[categoryOf(row.action)]} />
                <span className="min-w-0 flex-1 truncate">
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
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <ActivityIcon icon={MessageSquare} />
                  <span className="min-w-0 flex-1 truncate">
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
