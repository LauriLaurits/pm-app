import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RevokeButton } from "./revoke-button";
import { formatDate, humanize, initials } from "./types";
import type { DelegationListItem } from "./types";

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
        {item.canRevoke && <RevokeButton delegationId={item.id} />}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {formatDate(item.starts_at)} – {formatDate(item.ends_at)}
          {item.revoked_at && (
            <span className="text-destructive"> · revoked {formatDate(item.revoked_at)}</span>
          )}
        </p>
        <div className="flex flex-wrap gap-1">
          {item.projects.map((p) => (
            <Badge key={p.id} variant="secondary">
              {p.name}
            </Badge>
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
      <Avatar size="sm">
        <AvatarImage src={avatar ?? undefined} alt={name} />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium">{name}</span>
    </div>
  );
}
