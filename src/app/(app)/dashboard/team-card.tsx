import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonAvatar } from "@/components/person-avatar";
import { utilizationBarClasses } from "@/lib/workload";
import type { WorkloadPerson } from "./types";

const TEAM_CAP = 8;

// Portfolio-wide "who's most loaded" glance -- active people only (inactive people carry no
// current allocation worth surfacing here), highest utilization first so overallocation is the
// first thing the viewer sees. Full breakdown lives at /workload.
export function TeamCard({ people }: { people: WorkloadPerson[] }) {
  const top = people
    .filter((p) => p.status === "active")
    .sort((a, b) => (b.current_allocation_pct ?? 0) - (a.current_allocation_pct ?? 0))
    .slice(0, TEAM_CAP);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Team</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" render={<Link href="/workload" />}>
            View full
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No active team members.</p>
        ) : (
          <ul className="space-y-3">
            {top.map((p) => {
              const pct = p.current_allocation_pct ?? 0;
              return (
                <li key={p.id} className="flex items-center gap-3">
                  <Link href={`/people/${p.id}`} className="shrink-0">
                    <PersonAvatar name={p.full_name} avatarUrl={p.avatar_url} className="size-7" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/people/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                      {p.full_name}
                    </Link>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${utilizationBarClasses(pct)}`}
                        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
