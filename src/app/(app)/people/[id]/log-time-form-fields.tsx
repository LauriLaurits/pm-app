import type { Control } from "react-hook-form";
import type { TimeEntryInput } from "@/lib/validation/time-entry";
import type { AssignedProjectOption, PartOption } from "./types";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Project picker — options are the caller's OWN assigned projects only (built server-side in
 * page.tsx from their assignments), so nothing here can even offer a project they're not
 * assigned to. `onProjectChange` lets the parent form reset the (project-scoped) part field. */
export function ProjectField({
  control,
  projects,
  onProjectChange,
}: {
  control: Control<TimeEntryInput>;
  projects: AssignedProjectOption[];
  onProjectChange: (projectId: string) => void;
}) {
  return (
    <FormField
      control={control}
      name="project_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Project</FormLabel>
          <Select
            value={field.value}
            onValueChange={(v) => {
              if (v == null) return;
              field.onChange(v);
              onProjectChange(v);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => projects.find((p) => p.id === v)?.name ?? "Select a project"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Part picker, scoped to whatever `parts` the parent resolved for the currently selected
 * project. Hidden entirely when that project has no parts (optional field either way). */
export function PartField({ control, parts }: { control: Control<TimeEntryInput>; parts: PartOption[] }) {
  if (parts.length === 0) return null;
  return (
    <FormField
      control={control}
      name="project_part_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Part (optional)</FormLabel>
          <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === "none" ? "No specific part" : (parts.find((p) => p.id === v)?.name ?? "No specific part")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No specific part</SelectItem>
              {parts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function HoursDateFields({ control }: { control: Control<TimeEntryInput> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField
        control={control}
        name="entry_date"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Date</FormLabel>
            <FormControl render={<Input type="date" {...field} />} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="hours"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Hours</FormLabel>
            <FormControl
              render={
                <Input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function BillableField({ control }: { control: Control<TimeEntryInput> }) {
  return (
    <FormField
      control={control}
      name="billable"
      render={({ field }) => (
        <FormItem className="flex flex-row items-center gap-2 space-y-0">
          <FormControl
            render={<Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />}
          />
          <FormLabel className="font-normal">Billable</FormLabel>
        </FormItem>
      )}
    />
  );
}
