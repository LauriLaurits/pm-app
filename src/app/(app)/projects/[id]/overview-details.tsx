import Link from "next/link";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { visibleProjectTags } from "@/lib/project-icons";
import { formatDate } from "../types";
import type { PersonRef } from "./types";
import type { ProjectRow } from "./types";

// Details + people in one card (progress and deadline moved to the header strip so they aren't
// repeated; the description now lives at the title level in the detail layout, so it isn't
// repeated here either). The header answers "where does it stand right now".
export function OverviewDetailsCard({
  project,
  pm,
  owner,
  clientName,
  clientContact,
  editAction,
}: {
  project: ProjectRow;
  pm: PersonRef;
  owner: PersonRef;
  clientName: string | null;
  clientContact: { name: string; email: string | null } | null;
  editAction?: React.ReactNode;
}) {
  const visibleTags = visibleProjectTags(project.tags);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        {editAction && <CardAction>{editAction}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <PersonRow label="Project manager" person={pm} />
          <PersonRow label="Owner" person={owner} />
          {project.client_id && (
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Client</span>
              <div className="text-right">
                <p className="font-medium">{clientName ?? "—"}</p>
                {clientContact && (
                  <p className="text-muted-foreground">
                    {clientContact.name}
                    {clientContact.email ? ` · ${clientContact.email}` : ""}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Start date</span>
            <span>{formatDate(project.start_date)}</span>
          </div>
        </div>

        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            {visibleTags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PersonRow({ label, person }: { label: string; person: PersonRef }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {person ? (
        <Link href={`/people/${person.person_id}`} className="flex items-center gap-2 hover:underline">
          <PersonAvatar name={person.full_name} avatarUrl={person.avatar_url} className="size-8" />
          <span className="text-sm font-medium">{person.full_name}</span>
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
