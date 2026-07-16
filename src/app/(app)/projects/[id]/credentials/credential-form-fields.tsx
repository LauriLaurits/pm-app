import type { Control, FieldPath } from "react-hook-form";
import {
  CREDENTIAL_ENVIRONMENT_OPTIONS, CREDENTIAL_TYPE_OPTIONS, CREDENTIAL_VISIBILITY_OPTIONS,
  type CredentialInput,
} from "@/lib/validation/project";
import { humanize } from "../../types";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/** name/username/related_url are plain nullable-text <Input>s bound the same way -- one
 * renderer for all three (secret and expires_at have their own types, so stay in credential-form). */
export function CredentialTextField({
  control,
  name,
  label,
  placeholder,
  nullable = true,
}: {
  control: Control<CredentialInput>;
  name: FieldPath<CredentialInput>;
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
 * for all three, same pattern as LinkEnumSelectField / EnumSelectField (parts). */
export function CredentialEnumSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<CredentialInput>;
  name: "type" | "environment" | "visibility";
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
