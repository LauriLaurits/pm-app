import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddSkillDialog } from "./add-skill-dialog";
import { SkillRow } from "./skill-row";
import type { PersonSkillRow, SkillOption } from "./types";

/** Read-only badge list for everyone; when `canManage` is true (manage_people holders --
 * see page.tsx) each skill instead renders as an editable row (level select + remove) and an
 * "Add skill" dialog appears in the header. */
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
        {canManage && (
          <CardAction>
            <AddSkillDialog
              personId={personId}
              allSkills={allSkills}
              existingSkillIds={skills.map((s) => s.skill_id)}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills recorded.</p>
        ) : canManage ? (
          <div className="space-y-2">
            {skills.map((s) => (
              <SkillRow key={s.skill_id} personId={personId} skill={s} />
            ))}
          </div>
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
