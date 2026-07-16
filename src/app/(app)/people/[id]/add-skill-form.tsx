"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addPersonSkillAction } from "@/app/actions/person-skills";
import {
  personSkillSchema, SKILL_LEVEL_OPTIONS, type PersonSkillInput,
} from "@/lib/validation/person-skills";
import type { SkillOption } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Sentinel select value for "type a brand-new skill" -- distinct from any real skill uuid.
const NEW_SKILL_VALUE = "__new__";

function defaults(): PersonSkillInput {
  return { skill_id: null, new_skill_name: null, new_skill_category: null, level: 3 };
}

/** Add-skill-to-person form. `skill_id` picks from `availableSkills` (already-linked skills
 * filtered out by the parent dialog); selecting "Add a new skill…" instead reveals name/category
 * inputs -- addPersonSkillAction creates the `skills` row server-side and links it. */
export function AddSkillForm({
  personId,
  availableSkills,
  onSuccess,
}: {
  personId: string;
  availableSkills: SkillOption[];
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<PersonSkillInput>({
    resolver: zodResolver(personSkillSchema),
    defaultValues: defaults(),
  });
  const skillId = useWatch({ control: form.control, name: "skill_id" });
  const isNew = !skillId || skillId === NEW_SKILL_VALUE;

  function onSubmit(values: PersonSkillInput) {
    setServerError(null);
    // Strip whichever half of the "pick existing OR create new" shape doesn't apply, so the
    // server only ever sees one mode's fields populated.
    const payload: PersonSkillInput = isNew
      ? { ...values, skill_id: null }
      : { ...values, new_skill_name: null, new_skill_category: null };
    startTransition(async () => {
      const result = await addPersonSkillAction(personId, payload);
      if ("error" in result) setServerError(result.error);
      else {
        form.reset(defaults());
        onSuccess();
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="skill_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Skill</FormLabel>
              <Select
                value={field.value ?? NEW_SKILL_VALUE}
                onValueChange={(v) => v && field.onChange(v === NEW_SKILL_VALUE ? null : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) =>
                      v === NEW_SKILL_VALUE
                        ? "Add a new skill…"
                        : (availableSkills.find((s) => s.id === v)?.name ?? "Select a skill")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_SKILL_VALUE}>Add a new skill…</SelectItem>
                  {availableSkills.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {isNew && (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="new_skill_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New skill name</FormLabel>
                  <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="new_skill_category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (optional)</FormLabel>
                  <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
        <FormField
          control={form.control}
          name="level"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Level</FormLabel>
              <Select value={String(field.value)} onValueChange={(v) => v && field.onChange(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => `L${v}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVEL_OPTIONS.map((l) => (
                    <SelectItem key={l} value={String(l)}>L{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add skill"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
