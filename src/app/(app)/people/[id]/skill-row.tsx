"use client";

import { useState, useTransition } from "react";
import { removePersonSkillAction, setPersonSkillLevelAction } from "@/app/actions/person-skills";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SKILL_LEVEL_OPTIONS } from "@/lib/validation/person-skills";
import type { PersonSkillRow } from "./types";

/** A single managed skill: name badge + level select + remove. Only ever rendered when the
 * viewer holds manage_people (see SkillsCard) -- the actions re-check server-side either way. */
export function SkillRow({ personId, skill }: { personId: string; skill: PersonSkillRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onLevelChange(level: number) {
    setError(null);
    startTransition(async () => {
      const result = await setPersonSkillLevelAction(personId, skill.skill_id, level);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <Badge variant="secondary">{skill.skills?.name ?? "Unknown"}</Badge>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Select
          value={String(skill.level)}
          onValueChange={(v) => v && onLevelChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-16" size="sm" disabled={isPending}>
            <SelectValue>{(v: string) => `L${v}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SKILL_LEVEL_OPTIONS.map((l) => (
              <SelectItem key={l} value={String(l)}>
                L{l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost" />}
          triggerLabel="Remove"
          title="Remove this skill?"
          description={`Remove "${skill.skills?.name ?? "this skill"}" from this person?`}
          confirmLabel="Remove"
          pendingLabel="Removing…"
          onConfirm={() => removePersonSkillAction(personId, skill.skill_id)}
        />
      </div>
    </div>
  );
}
