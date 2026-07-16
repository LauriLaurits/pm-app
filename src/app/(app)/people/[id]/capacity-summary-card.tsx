import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PersonWorkloadRow } from "../types";

export function CapacitySummaryCard({ person }: { person: PersonWorkloadRow }) {
  const pct = person.current_allocation_pct ?? 0;
  const capacity = Number(person.weekly_capacity_hours ?? 0);
  const allocatedHours = Math.round((pct / 100) * capacity * 10) / 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capacity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Weekly capacity</span>
          <span className="font-medium">{capacity}h</span>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Current allocation</span>
          <span className="font-medium">
            {pct}% (~{allocatedHours}h)
          </span>
        </div>
        <Progress value={Math.min(pct, 100)} />
        {pct > 100 && (
          <p className="text-xs text-red-700 dark:text-red-400">
            Overallocated by {pct - 100}%.
          </p>
        )}
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Active projects</span>
          <span className="font-medium">{person.active_project_count ?? 0}</span>
        </div>
      </CardContent>
    </Card>
  );
}
