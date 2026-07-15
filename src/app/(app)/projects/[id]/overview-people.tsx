import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initials } from "../types";
import type { PersonRef } from "./types";

function PersonRow({ label, person }: { label: string; person: PersonRef }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {person ? (
        <div className="flex items-center gap-2">
          <Avatar size="sm">
            <AvatarImage src={person.avatar_url ?? undefined} alt={person.full_name} />
            <AvatarFallback>{initials(person.full_name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{person.full_name}</span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

export function OverviewPeopleCard({
  pm,
  owner,
}: {
  pm: PersonRef;
  owner: PersonRef;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PersonRow label="Project manager" person={pm} />
        <PersonRow label="Owner" person={owner} />
      </CardContent>
    </Card>
  );
}
