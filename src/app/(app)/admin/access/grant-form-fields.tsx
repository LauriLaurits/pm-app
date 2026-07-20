import type { Control } from "react-hook-form";
import { MultiSelectToggle } from "@/components/multi-select-toggle";
import { humanize } from "./types";
import type { PermissionOption, ProjectOption } from "./types";
import type { GrantAccessInput } from "@/lib/validation/access";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** "Which project" picker -- `projects` is the full catalog (this screen is admin-only, see
 * grant-form.tsx's header comment), so any project may be picked here. */
export function ProjectSelectField({
  control,
  projects,
}: {
  control: Control<GrantAccessInput>;
  projects: ProjectOption[];
}) {
  return (
    <FormField
      control={control}
      name="project_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Project</FormLabel>
          <Select value={field.value ?? ""} onValueChange={(v) => v && field.onChange(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {() => projects.find((p) => p.id === field.value)?.name ?? "Select a project"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** "What they can do" toggle -- `permissions` is already filtered to the grantable set. */
export function PermissionsField({
  control,
  permissions,
}: {
  control: Control<GrantAccessInput>;
  permissions: PermissionOption[];
}) {
  return (
    <FormField
      control={control}
      name="permission_keys"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Permissions to grant</FormLabel>
          <MultiSelectToggle
            options={permissions.map((p) => ({ value: p.key, label: humanize(p.key) }))}
            value={field.value}
            onValueChange={field.onChange}
            emptyMessage="No permissions configured."
            aria-label="Permissions to grant"
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Optional expiry date for the "When it ends" section. */
export function ExpiresField({ control }: { control: Control<GrantAccessInput> }) {
  return (
    <FormField
      control={control}
      name="expires_at"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Expires (optional)</FormLabel>
          <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
