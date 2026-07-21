import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { avatarTint } from "@/lib/avatar-tint";
import { formatDate, initials } from "../types";
import type { PersonRef } from "./types";
import type { ProjectRow } from "./types";

// Details + people in one card (progress and deadline moved to the header strip so they aren't
// repeated). "Details" is the standing description of the project; the header answers "where does
// it stand right now".
export function OverviewDetailsCard({
  project,
  pm,
  owner,
  editAction,
}: {
  project: ProjectRow;
  pm: PersonRef;
  owner: PersonRef;
  editAction?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        {editAction && <CardAction>{editAction}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">
          {project.description ?? <span className="text-muted-foreground">No description.</span>}
        </p>

        <div className="space-y-3 border-t pt-3">
          <PersonRow label="Project manager" person={pm} />
          <PersonRow label="Owner" person={owner} />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Start date</span>
            <span>{formatDate(project.start_date)}</span>
          </div>
        </div>

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            {project.tags.map((tag) => (
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
          <Avatar size="sm">
            <AvatarImage src={person.avatar_url ?? undefined} alt={person.full_name} />
            <AvatarFallback className={avatarTint(person.full_name)}>
              {initials(person.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{person.full_name}</span>
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
