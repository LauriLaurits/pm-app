import type { Control } from "react-hook-form";
import { MultiSelectToggle } from "@/components/multi-select-toggle";
import { humanize } from "./types";
import type { PermissionOption, ProjectOption } from "./types";
import type { CreateDelegationInput } from "@/lib/validation/delegation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

/** "Which projects" toggle -- `projects` is already bounded to the caller's own projects (see
 * page.tsx / delegation-form.tsx's header comment), so every option offered here is safe to hand
 * over as far as project scope goes. */
export function ProjectsField({
  control,
  projects,
}: {
  control: Control<CreateDelegationInput>;
  projects: ProjectOption[];
}) {
  return (
    <FormField
      control={control}
      name="project_ids"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Projects to cover</FormLabel>
          <MultiSelectToggle
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={field.value}
            onValueChange={field.onChange}
            emptyMessage="You aren't the PM on any project."
            aria-label="Projects to delegate"
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** "What they can do" toggle -- `permissions` is already filtered to delegatable=true. */
export function PermissionsField({
  control,
  permissions,
}: {
  control: Control<CreateDelegationInput>;
  permissions: PermissionOption[];
}) {
  return (
    <FormField
      control={control}
      name="permission_keys"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Permissions to hand over</FormLabel>
          <MultiSelectToggle
            options={permissions.map((p) => ({ value: p.key, label: humanize(p.key) }))}
            value={field.value}
            onValueChange={field.onChange}
            emptyMessage="No delegatable permissions configured."
            aria-label="Permissions to delegate"
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Starts/ends date pair for the "When" section. */
export function DateRangeFields({ control }: { control: Control<CreateDelegationInput> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField
        control={control}
        name="starts_at"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Starts</FormLabel>
            <FormControl render={<Input type="date" {...field} />} />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="ends_at"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Ends</FormLabel>
            <FormControl render={<Input type="date" {...field} />} />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

/** Optional free-text handover notes. */
export function NotesField({ control }: { control: Control<CreateDelegationInput> }) {
  return (
    <FormField
      control={control}
      name="handover_notes"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Notes</FormLabel>
          <FormControl
            render={<Textarea rows={3} placeholder="What should they know?" {...field} value={field.value ?? ""} />}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
