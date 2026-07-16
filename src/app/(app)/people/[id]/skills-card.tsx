import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonSkillRow } from "./types";

export function SkillsCard({ skills }: { skills: PersonSkillRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s, i) => (
              <Badge key={s.skills?.name ?? i} variant="secondary">
                {s.skills?.name ?? "Unknown"} · L{s.level}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
