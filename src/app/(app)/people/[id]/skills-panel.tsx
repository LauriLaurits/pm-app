"use client";

import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewSkillInlineForm } from "./new-skill-inline-form";
import { SkillChip } from "./skill-chip";
import type { PersonSkillRow, SkillOption } from "./types";

/** Groups the full skills catalog by category and renders each as a toggle chip -- "on" (the
 * person already has it, with an inline level control + remove) or "off" (muted outline, click
 * to add at the default level). Replaces the old one-at-a-time "Add skill" dialog: tagging five
 * skills is five clicks here instead of five dialog round-trips. */
export function SkillsPanel({
  personId,
  personSkills,
  allSkills,
}: {
  personId: string;
  personSkills: PersonSkillRow[];
  allSkills: SkillOption[];
}) {
  const [addingNew, setAddingNew] = useState(false);
  const levelBySkillId = useMemo(
    () => new Map(personSkills.map((s) => [s.skill_id, s.level])),
    [personSkills]
  );

  const groups = useMemo(() => {
    // Keyed case-insensitively so e.g. "Backend" and "backend" (someone typing a new skill's
    // category slightly differently than the existing catalog casing) land in the same group
    // instead of rendering two near-identical headings. The label shown is whichever casing
    // was seen first.
    const byCategory = new Map<string, { label: string; skills: SkillOption[] }>();
    for (const skill of allSkills) {
      const label = skill.category?.trim() || "Other";
      const key = label.toLowerCase();
      if (!byCategory.has(key)) byCategory.set(key, { label, skills: [] });
      byCategory.get(key)!.skills.push(skill);
    }
    return [...byCategory.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [allSkills]);

  return (
    <div className="space-y-4">
      {groups.length === 0 && !addingNew && (
        <p className="text-sm text-muted-foreground">No skills in the catalog yet.</p>
      )}
      {groups.map(({ label, skills: categorySkills }) => (
        <div key={label.toLowerCase()} className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categorySkills.map((skill) => (
              <SkillChip
                key={skill.id}
                personId={personId}
                skill={skill}
                level={levelBySkillId.get(skill.id) ?? null}
              />
            ))}
          </div>
        </div>
      ))}
      {addingNew ? (
        <NewSkillInlineForm personId={personId} onDone={() => setAddingNew(false)} />
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAddingNew(true)}>
          <PlusIcon /> New skill
        </Button>
      )}
    </div>
  );
}
