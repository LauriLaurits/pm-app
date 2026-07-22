import { useEffect, useState } from "react";
import { useWatch, type Control } from "react-hook-form";
import { humanize } from "../types";
import type { CreateProjectInput } from "@/lib/validation/project";
import { ClientQuickCreateDialog } from "@/app/(app)/clients/client-quick-create-dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const NO_CLIENT = "__none__";
const NEW_CLIENT = "__new__";
const NO_CONTACT = "__none__";

export type ClientOption = { id: string; name: string };
export type ClientContactOption = { id: string; client_id: string; name: string; email: string | null };
export type PmOption = { user_id: string; full_name: string };

/** PM select over every active PM/admin in the system (pm_options() server-side), defaulting to
 * the creator via the form's defaultValues. Any create_project holder may pick a colleague --
 * the "create project" RLS policy re-checks the target is a real PM/admin. */
export function PmField({
  control,
  pms,
}: {
  control: Control<CreateProjectInput>;
  pms: PmOption[];
}) {
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
                {(v: string) => pms.find((p) => p.user_id === v)?.full_name ?? "Select a project manager"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pms.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Optional client picker -- a project may not have one yet, so a "No client" sentinel maps
 * back to null (same pattern as the "All ..." sentinels in project-filters.tsx). A "＋ New
 * client…" entry opens ClientQuickCreateDialog inline (no navigating away from this form); the
 * newly created client is appended to the local option list and selected immediately. */
export function ClientField({
  control,
  clients: initialClients,
}: {
  control: Control<CreateProjectInput>;
  clients: ClientOption[];
}) {
  const [clients, setClients] = useState(initialClients);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <FormField
      control={control}
      name="client_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Client</FormLabel>
          <Select
            value={field.value ?? NO_CLIENT}
            onValueChange={(v) => {
              if (v === NEW_CLIENT) {
                setDialogOpen(true);
                return;
              }
              field.onChange(v === NO_CLIENT ? null : v);
            }}
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
              <SelectSeparator />
              <SelectItem value={NEW_CLIENT}>＋ New client…</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
          <ClientQuickCreateDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onCreated={(client) => {
              setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
              field.onChange(client.id);
            }}
          />
        </FormItem>
      )}
    />
  );
}

/** Contact person of the SELECTED client -- hidden entirely until a client with contacts is
 * chosen (feedback: no dead fields). Watches client_id so switching clients swaps the option
 * list, and a contact that no longer belongs to the current client is cleared automatically
 * (the server action re-validates ownership regardless). */
export function ClientContactField({
  control,
  contacts,
}: {
  control: Control<CreateProjectInput>;
  contacts: ClientContactOption[];
}) {
  const clientId = useWatch({ control, name: "client_id" }) ?? null;
  const options = contacts.filter((c) => c.client_id === clientId);

  return (
    <FormField
      control={control}
      name="client_contact_id"
      render={({ field }) => (
        <ContactSelect
          value={field.value ?? null}
          onChange={field.onChange}
          options={options}
          visible={!!clientId && options.length > 0}
        />
      )}
    />
  );
}

/** Split out so the stale-selection cleanup can be a hook (hooks can't live in a render prop). */
function ContactSelect({
  value,
  onChange,
  options,
  visible,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: ClientContactOption[];
  visible: boolean;
}) {
  const stale = !!value && !options.some((o) => o.id === value);
  useEffect(() => {
    if (stale) onChange(null);
  }, [stale, onChange]);

  if (!visible) return null;
  return (
    <FormItem>
      <FormLabel>Client contact</FormLabel>
      <Select
        value={value ?? NO_CONTACT}
        onValueChange={(v) => onChange(v === NO_CONTACT ? null : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {(v: string) => (v === NO_CONTACT ? "No contact" : options.find((o) => o.id === v)?.name ?? "No contact")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CONTACT}>No contact</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
              {o.email ? ` — ${o.email}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
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

/**
 * The comma bug: the old input's value was re-derived from the parsed tags array
 * (`join(", ")`), so the trailing comma the user just typed was stripped on the very next
 * render -- "foo," instantly became "foo" and typing on produced "foob", one mangled tag.
 * Fix: keep the raw text in local state (commas and all) and commit the parsed array to the
 * form on every change, so a comma reliably splits off a new tag.
 */
export function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState(() => (value ?? []).join(", "));
  return (
    <Input
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean));
      }}
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
          <FormControl render={<TagsInput value={field.value ?? []} onChange={field.onChange} />} />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
