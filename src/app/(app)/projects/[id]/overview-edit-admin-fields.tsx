import type { Control } from "react-hook-form";
import type { EditProjectInput } from "@/lib/validation/project";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const NO_CLIENT = "__none__";

export type ClientOption = { id: string; name: string };
export type PmOption = { user_id: string; full_name: string };

/** Optional client picker -- same "No client" sentinel pattern as the create form's ClientField
 * (project-create-fields.tsx), just bound to EditProjectInput instead of CreateProjectInput. */
export function ClientField({
  control,
  clients,
}: {
  control: Control<EditProjectInput>;
  clients: ClientOption[];
}) {
  return (
    <FormField
      control={control}
      name="client_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Client</FormLabel>
          <Select
            value={field.value ?? NO_CLIENT}
            onValueChange={(v) => field.onChange(v === NO_CLIENT ? null : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => (v === NO_CLIENT ? "No client" : clients.find((c) => c.id === v)?.name ?? "No client")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>No client</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * pm_id is only ever writable by an admin -- the `protect_project_pm` DB trigger blocks any
 * non-admin update to this column outright, raising if the value changes at all. Non-admins get
 * a disabled, read-only display of the current PM's name instead; since this field is simply
 * never registered as a FormField for them, react-hook-form keeps submitting its untouched
 * defaultValue, which satisfies the trigger (no change = no exception).
 */
export function PmField({
  control,
  candidates,
  isAdmin,
  currentPmName,
}: {
  control: Control<EditProjectInput>;
  candidates: PmOption[];
  isAdmin: boolean;
  currentPmName: string;
}) {
  if (!isAdmin) {
    return (
      <FormItem>
        <FormLabel>Project manager</FormLabel>
        <p className="text-sm text-muted-foreground">{currentPmName} (only an admin can reassign)</p>
      </FormItem>
    );
  }

  return (
    <FormField
      control={control}
      name="pm_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Project manager</FormLabel>
          <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => candidates.find((c) => c.user_id === v)?.full_name ?? currentPmName}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
