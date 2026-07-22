import { useFieldArray, useFormState, type Control } from "react-hook-form";
import { PlusIcon, XIcon } from "lucide-react";
import type {
  CreateProjectInput, EditProjectInput, MilestoneInput, MilestoneKind,
} from "@/lib/validation/project";
import { MILESTONE_KIND_OPTIONS } from "@/lib/validation/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DESTRUCTIVE_ACTION_CLASS, NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";

export const MILESTONE_KIND_LABEL: Record<MilestoneKind, string> = {
  start: "Start",
  end: "End",
  milestone: "Milestone",
};

export const BLANK_MILESTONE: MilestoneInput = {
  name: "", due_on: "", kind: "milestone", done: false,
};

/** A row someone added but never typed into -- dropped silently before validation instead of
 * failing "Name is required" on a row they never meant to keep (same rule as the client form's
 * isBlankContact, except here the drop happens pre-validation, see dropBlankMilestones). */
export function isBlankMilestone(m: MilestoneInput): boolean {
  return m.name.trim() === "" && m.due_on.trim() === "";
}

/** Both project forms carry an identical `milestones` subtree, but RHF's Control generic is
 * invariant, so the union collapses to one of them for the array helpers. Safe: nothing here
 * touches any field outside `milestones`. */
type MilestonesControl = Control<CreateProjectInput> | Control<EditProjectInput>;

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_8.25rem_7.5rem_1.75rem] items-start gap-2";

/**
 * Repeatable milestone rows (name / date / kind) for the Timeline sections of the create and
 * edit project forms -- replaces the old bare start-date/deadline fields (P4 feedback). Kind
 * Start/End rows drive the project's start_date/deadline via the DB sync trigger; `done` is
 * not edited here (it round-trips invisibly so the Overview toggle state survives a save).
 */
export function MilestonesEditor({ control: controlProp }: { control: MilestonesControl }) {
  const control = controlProp as Control<CreateProjectInput>;
  const rows = useFieldArray({ control, name: "milestones" });
  const { errors } = useFormState({ control, name: "milestones" });
  // Array-level refine messages ("Only one milestone can mark the start") land on the array
  // itself, not a row field -- surface them under the list.
  const milestonesError = errors.milestones;
  const arrayError =
    milestonesError?.root?.message ??
    (typeof milestonesError?.message === "string" ? milestonesError.message : undefined);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Milestones</span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className={NEUTRAL_ACTION_CLASS}
          onClick={() => rows.append({ ...BLANK_MILESTONE })}
        >
          <PlusIcon /> Add milestone
        </Button>
      </div>
      {rows.fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No milestones yet. Mark one as Start and one as End to set the project&apos;s dates.
        </p>
      ) : (
        <>
          <div className={`${ROW_GRID} text-xs font-medium text-muted-foreground`}>
            <span>Name</span>
            <span>Date</span>
            <span>Kind</span>
            <span aria-hidden />
          </div>
          {rows.fields.map((row, index) => (
            <div key={row.id} className={ROW_GRID}>
              <FormField
                control={control}
                name={`milestones.${index}.name`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Name</FormLabel>
                    <FormControl render={<Input placeholder="e.g. Go-live" {...field} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`milestones.${index}.due_on`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Date</FormLabel>
                    <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`milestones.${index}.kind`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Kind</FormLabel>
                    <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v: string) => MILESTONE_KIND_LABEL[v as MilestoneKind] ?? "Kind"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {MILESTONE_KIND_OPTIONS.map((k) => (
                          <SelectItem key={k} value={k}>{MILESTONE_KIND_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className={`${DESTRUCTIVE_ACTION_CLASS} mt-1`}
                aria-label="Remove milestone"
                onClick={() => rows.remove(index)}
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </>
      )}
      {arrayError && <p className="text-sm text-destructive">{arrayError}</p>}
    </div>
  );
}
