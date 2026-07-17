"use client";

import { useState, useTransition } from "react";
import { XIcon } from "lucide-react";
import {
  addPersonSkillAction, removePersonSkillAction, setPersonSkillLevelAction,
} from "@/app/actions/person-skills";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { SKILL_LEVEL_OPTIONS } from "@/lib/validation/person-skills";
import type { SkillOption } from "./types";

const DEFAULT_LEVEL = 3;

/** One catalog skill rendered as a toggle chip. `level === null` means the person doesn't have
 * it yet -- a dashed outline pill that adds the skill (at the default level) on click. Otherwise
 * it's a filled "on" pill with an inline 1-5 level control and a remove button, both calling the
 * existing gated server actions directly -- no dialog, no intermediate form. */
export function SkillChip({
  personId,
  skill,
  level,
}: {
  personId: string;
  skill: SkillOption;
  level: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isOn = level !== null;

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addPersonSkillAction(personId, {
        skill_id: skill.id,
        new_skill_name: null,
        new_skill_category: null,
        level: DEFAULT_LEVEL,
      });
      if ("error" in result) setError(result.error);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removePersonSkillAction(personId, skill.id);
      if ("error" in result) setError(result.error);
    });
  }

  function changeLevel(next: number) {
    if (next === level) return;
    setError(null);
    startTransition(async () => {
      const result = await setPersonSkillLevelAction(personId, skill.id, next);
      if ("error" in result) setError(result.error);
    });
  }

  if (!isOn) {
    return (
      <button
        type="button"
        onClick={add}
        disabled={isPending}
        aria-pressed="false"
        aria-label={`Add ${skill.name}`}
        title={error ?? `Add ${skill.name}`}
        className={cn(
          "inline-flex h-6 items-center rounded-full border border-dashed border-input px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50",
          error && "border-destructive text-destructive"
        )}
      >
        {skill.name}
      </button>
    );
  }

  return (
    <div
      aria-label={`${skill.name}, level ${level}`}
      title={error ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pr-1 pl-2.5",
        error && "border-destructive bg-destructive/10"
      )}
    >
      <span className="text-xs font-medium text-primary">{skill.name}</span>
      <ToggleGroup
        value={[String(level)]}
        onValueChange={(v) => v[0] && changeLevel(Number(v[0]))}
        size="sm"
        spacing={0}
        aria-label={`Level for ${skill.name}`}
      >
        {SKILL_LEVEL_OPTIONS.map((l) => (
          <ToggleGroupItem
            key={l}
            value={String(l)}
            disabled={isPending}
            aria-label={`Set ${skill.name} to level ${l}`}
            className="h-5 w-5 min-w-5 rounded-full px-0 text-[10px]"
          >
            {l}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={isPending}
        aria-label={`Remove ${skill.name}`}
        onClick={remove}
        className="rounded-full text-primary hover:text-destructive"
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}
