import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkillsPanel } from "./skills-panel";
import type { PersonSkillRow, SkillOption } from "./types";

/** Read-only badge list for everyone; when `canManage` is true (manage_people holders -- see
 * page.tsx) the whole catalog instead renders as a toggle-chip panel (SkillsPanel) -- clicking
 * a skill on/off adds/removes it immediately, replacing the old one-at-a-time "Add skill"
 * dialog. */
export function SkillsCard({
  personId,
  skills,
  canManage = false,
  allSkills = [],
}: {
  personId: string;
  skills: PersonSkillRow[];
  canManage?: boolean;
  allSkills?: SkillOption[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <SkillsPanel personId={personId} personSkills={skills} allSkills={allSkills} />
        ) : skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s, i) => (
              <Badge key={s.skill_id ?? i} variant="secondary">
                {s.skills?.name ?? "Unknown"} · L{s.level}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
