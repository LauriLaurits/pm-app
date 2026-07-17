import type { Control } from "react-hook-form";
import { humanize } from "../types";
import type { CreateProjectInput } from "@/lib/validation/project";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const NO_CLIENT = "__none__";

export type ClientOption = { id: string; name: string };

/** Optional client picker -- a project may not have one yet, so a "No client" sentinel maps
 * back to null (same pattern as the "All ..." sentinels in project-filters.tsx). */
export function ClientField({
  control,
  clients,
}: {
  control: Control<CreateProjectInput>;
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

/** Status/health/priority/budget_type are all enum <Select>s bound the same way -- one field
 * renderer for all four, all pre-filled with sensible defaults by the caller's defaultValues. */
export function EnumSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<CreateProjectInput>;
  name: "status" | "health" | "priority" | "budget_type";
  label: string;
  options: readonly string[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => humanize(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {humanize(o)}
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

/** Start date / deadline are both plain <input type="date">s bound the same way. */
export function DateField({
  control,
  name,
  label,
}: {
  control: Control<CreateProjectInput>;
  name: "start_date" | "deadline";
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TagsField({ control }: { control: Control<CreateProjectInput> }) {
  return (
    <FormField
      control={control}
      name="tags"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Tags (comma-separated)</FormLabel>
          <FormControl
            render={
              <Input
                value={(field.value ?? []).join(", ")}
                onChange={(e) =>
                  field.onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))
                }
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
