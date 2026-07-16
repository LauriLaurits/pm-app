import type { Control } from "react-hook-form";
import { LINK_TYPE_OPTIONS, LINK_VISIBILITY_OPTIONS, type LinkInput } from "@/lib/validation/project";
import { humanize } from "../../types";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/** type/visibility are both enum <Select>s bound the same way -- one renderer for both. */
export function LinkEnumSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<LinkInput>;
  name: "type" | "visibility";
  label: string;
  options: typeof LINK_TYPE_OPTIONS | typeof LINK_VISIBILITY_OPTIONS;
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
                <SelectItem key={o} value={o}>{humanize(o)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
