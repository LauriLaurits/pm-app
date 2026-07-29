import Link from "next/link";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DotBadge } from "@/components/dot-badge";
import { RevokeButton } from "./revoke-button";
import { formatDate, humanize } from "./types";
import type { DelegationListItem } from "./types";

// Same dot-badge language as project statuses (STATUS_DOT in projects/types.ts): emerald = live,
// blue = scheduled, muted = elapsed with no action taken, red = explicitly revoked.
const STATUS_DOT_CLASS = {
  active: "bg-emerald-500",
  upcoming: "bg-blue-500",
  expired: "bg-muted-foreground/40",
  revoked: "bg-red-500",
} as const;

/** Header-row status pill: active/upcoming come straight from `group`; the merged "past" bucket
 * splits back into Expired (window elapsed, dot only) vs Revoked (explicit action, dot + date --
 * revoke is immediate per revoke-button.tsx, so the date is the moment access actually stopped). */
function StatusBadge({ item }: { item: DelegationListItem }) {
  if (item.group === "active") return <DotBadge dotClassName={STATUS_DOT_CLASS.active}>Active</DotBadge>;
  if (item.group === "upcoming") {
    return <DotBadge dotClassName={STATUS_DOT_CLASS.upcoming}>Upcoming</DotBadge>;
  }
  if (item.revoked_at) {
    return (
      <DotBadge dotClassName={STATUS_DOT_CLASS.revoked}>
        Revoked {formatDate(item.revoked_at)}
      </DotBadge>
    );
  }
  return <DotBadge dotClassName={STATUS_DOT_CLASS.expired}>Expired</DotBadge>;
}

/** One delegation: who granted → who received, the projects + permissions it covers, its window,
 * and handover notes. `item.canRevoke` (resolved server-side in page.tsx from from_user/admin +
 * not-already-revoked) is the only thing that decides whether the Revoke button renders --
 * revokeDelegationAction re-checks the same authority itself regardless. */
export function DelegationCard({ item }: { item: DelegationListItem }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PersonBadge name={item.from_name} avatar={item.from_avatar} />
          <span className="text-muted-foreground">→</span>
          <PersonBadge name={item.to_name} avatar={item.to_avatar} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge item={item} />
          {item.canRevoke && <RevokeButton delegationId={item.id} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatDate(item.starts_at)} – {formatDate(item.ends_at)}
        </p>
        <div className="flex flex-wrap gap-1">
          {item.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Badge variant="secondary" className="transition-colors hover:bg-secondary/70">
                {p.name}
              </Badge>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {item.permission_keys.map((k) => (
            <Badge key={k} variant="outline">
              {humanize(k)}
            </Badge>
          ))}
        </div>
        {item.handover_notes && <p className="text-sm">{item.handover_notes}</p>}
      </CardContent>
    </Card>
  );
}

function PersonBadge({ name, avatar }: { name: string; avatar: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <PersonAvatar name={name} avatarUrl={avatar} className="size-8" />
      <span className="text-sm font-medium">{name}</span>
    </div>
  );
}
