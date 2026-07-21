import { useEffect, useState } from "react";
import { useWatch, type Control } from "react-hook-form";
import type { EditProjectInput } from "@/lib/validation/project";
import { ClientQuickCreateDialog } from "@/app/(app)/clients/client-quick-create-dialog";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const NO_CLIENT = "__none__";
const NEW_CLIENT = "__new__";
const NO_CONTACT = "__none__";

export type ClientOption = { id: string; name: string };
export type ClientContactOption = { id: string; client_id: string; name: string; email: string | null };
export type PmOption = { user_id: string; full_name: string };

/** Optional client picker -- same "No client" sentinel pattern as the create form's ClientField
 * (project-create-fields.tsx), just bound to EditProjectInput instead of CreateProjectInput.
 * Also shares that field's "＋ New client…" inline quick-create entry. */
export function ClientField({
  control,
  clients: initialClients,
}: {
  control: Control<EditProjectInput>;
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

/** Contact person of the SELECTED client -- same behavior as the create form's
 * ClientContactField (project-create-fields.tsx), bound to EditProjectInput: hidden until a
 * client with contacts is chosen, options swap when the client changes, and a contact that no
 * longer belongs to the current client is cleared (the server action re-validates ownership). */
export function ClientContactField({
  control,
  contacts,
}: {
  control: Control<EditProjectInput>;
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
        <p className="text-sm text-muted-foreground">{currentPmName}</p>
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
