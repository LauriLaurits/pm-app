import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DotBadge } from "@/components/dot-badge";
import { avatarTint } from "@/lib/avatar-tint";
import { humanize, initials } from "../types";
import type { PersonWorkloadRow } from "../types";

/** The one derived state an assigning PM needs at a glance, in priority order: currently away
 * beats everything (allocation is moot this week), deactivated beats allocation, otherwise the
 * allocation itself phrased as an answer -- how many hours are actually free. */
function availabilityBadge(person: PersonWorkloadRow) {
  if (person.on_vacation_now) return <DotBadge dotClassName="bg-amber-400">Away</DotBadge>;
  if (person.status === "inactive")
    return <DotBadge dotClassName="bg-red-500">Deactivated</DotBadge>;

  const pct = person.current_allocation_pct ?? 0;
  const capacity = person.weekly_capacity_hours ?? 0;
  const allocated = Math.round((pct / 100) * capacity * 10) / 10;

  if (pct > 100) {
    return (
      <DotBadge dotClassName="bg-red-600" className="tabular-nums">
        Overallocated · {allocated}/{capacity} h · {Math.round(pct)}%
      </DotBadge>
    );
  }
  if (pct >= 100) {
    return (
      <DotBadge dotClassName="bg-amber-500" className="tabular-nums">
        Fully allocated · {allocated}/{capacity} h
      </DotBadge>
    );
  }
  const free = Math.round((capacity - allocated) * 10) / 10;
  return (
    <DotBadge dotClassName="bg-emerald-500" className="tabular-nums">
      Available · {free} h free
    </DotBadge>
  );
}

export function PersonHeader({ person }: { person: PersonWorkloadRow }) {
  // Fixed four-slot metadata line (role · team · type · capacity) -- em-dash placeholders keep
  // the slots aligned across people instead of silently collapsing.
  const meta = [
    person.role_title ?? "—",
    person.department ?? "—",
    person.employment_type ? humanize(person.employment_type) : "—",
    person.weekly_capacity_hours !== null ? `${person.weekly_capacity_hours}h/week` : "—",
  ];

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="size-12">
        <AvatarImage src={person.avatar_url ?? undefined} alt={person.full_name ?? ""} />
        <AvatarFallback className={avatarTint(person.full_name)}>
          {initials(person.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">{person.full_name}</h1>
          {availabilityBadge(person)}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {meta.map((part, i) => (
            <span key={i} className="flex items-center gap-x-2">
              {i > 0 && (
                <span aria-hidden className="text-border">
                  ·
                </span>
              )}
              {part}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
