import type { Control, FieldPath, FieldValues } from "react-hook-form";
import {
  CREDENTIAL_ENVIRONMENT_OPTIONS, CREDENTIAL_TYPE_OPTIONS, CREDENTIAL_VISIBILITY_OPTIONS,
} from "@/lib/validation/project";
import { humanize } from "../../types";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/** name/username/related_url are plain nullable-text <Input>s bound the same way -- one
 * renderer for all three (secret and expires_at have their own types, so stay in credential-form).
 * Generic over TFieldValues so it's shared between CredentialForm (create, has `secret`/`type`)
 * and CredentialEditForm (metadata-only, no `secret`/`type`). */
export function CredentialTextField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  nullable = true,
}: {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  nullable?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl
            render={<Input {...field} value={(nullable ? field.value ?? "" : field.value) as string} placeholder={placeholder} />}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** type/environment/visibility are all enum <Select>s bound the same way -- one renderer
 * for all three, same pattern as LinkEnumSelectField / EnumSelectField (parts). Generic for the
 * same reason as CredentialTextField above (shared between create and metadata-only edit). */
export function CredentialEnumSelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
}: {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options:
    | typeof CREDENTIAL_TYPE_OPTIONS
    | typeof CREDENTIAL_ENVIRONMENT_OPTIONS
    | typeof CREDENTIAL_VISIBILITY_OPTIONS;
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
