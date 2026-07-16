import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { humanize, initials } from "../types";
import type { PersonWorkloadRow } from "../types";
import { utilizationBadgeClasses, utilizationLabel } from "@/lib/workload";

export function PersonHeader({ person }: { person: PersonWorkloadRow }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar size="lg">
        <AvatarImage src={person.avatar_url ?? undefined} alt={person.full_name ?? ""} />
        <AvatarFallback>{initials(person.full_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold">{person.full_name}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {person.role_title && <span>{person.role_title}</span>}
          {person.department && <span>· {person.department}</span>}
          {person.employment_type && <span>· {humanize(person.employment_type)}</span>}
          <span>· {person.weekly_capacity_hours}h/wk capacity</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={utilizationBadgeClasses(person.current_allocation_pct ?? 0)}
        >
          {utilizationLabel(person.current_allocation_pct ?? 0)} · {person.current_allocation_pct ?? 0}%
        </Badge>
        {person.on_vacation_now && (
          <Badge
            variant="outline"
            className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
          >
            On vacation
          </Badge>
        )}
        {person.status === "inactive" && <Badge variant="ghost">Inactive</Badge>}
      </div>
    </div>
  );
}
