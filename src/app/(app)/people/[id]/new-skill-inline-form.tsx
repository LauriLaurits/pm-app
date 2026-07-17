"use client";

import { useState, useTransition } from "react";
import { addPersonSkillAction } from "@/app/actions/person-skills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEFAULT_LEVEL = 3;

/** Inline "add a brand-new catalog skill" row -- no dialog. Submitting creates the `skills` row
 * and links it to this person (at the default level) in one call to addPersonSkillAction; the
 * new skill then shows up as an "on" chip in SkillsPanel once the page revalidates. */
export function NewSkillInlineForm({
  personId,
  onDone,
}: {
  personId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a skill name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addPersonSkillAction(personId, {
        skill_id: null,
        new_skill_name: trimmed,
        new_skill_category: category.trim() || null,
        level: DEFAULT_LEVEL,
      });
      if ("error" in result) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <Input
        placeholder="New skill name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 w-40"
        autoFocus
        aria-label="New skill name"
      />
      <Input
        placeholder="Category (optional)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="h-8 w-40"
        aria-label="New skill category"
      />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Adding…" : "Add"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={isPending}>
        Cancel
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}
