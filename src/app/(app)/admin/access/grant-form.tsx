"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { grantProjectAccessAction } from "@/app/actions/access";
import { grantAccessSchema, type GrantAccessInput } from "@/lib/validation/access";
import { MultiSelectToggle } from "@/components/multi-select-toggle";
import { UserPickerField } from "./user-picker-field";
import { humanize } from "./types";
import type { PermissionOption, ProjectOption, UserOption } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DEFAULTS: GrantAccessInput = {
  user_id: "",
  project_id: "",
  permission_keys: [],
  expires_at: null,
};

/** Create-grant form: `projects` is the full catalog; `permissions` is the catalog already
 * filtered down to the grantable set (page.tsx excludes NON_GRANTABLE_PERMISSIONS --
 * manage_access, manage_users, view_audit, create_project, export_data, reveal_credential --
 * before it ever reaches this form, so those keys are never presented as options). This screen
 * is admin-only -- manage_access has no role_permissions rows at all, so only is_admin() ever
 * satisfies it -- an admin may grant any of the remaining permissions on any project, unlike the
 * delegations screen's own-projects/delegatable-only bounds. grantProjectAccessAction re-checks
 * requirePermission('manage_access', project_id) *and* the grantable denylist server-side
 * regardless of what's rendered here; the DB trigger `user_project_permissions_grantable` is the
 * final backstop for any caller. */
export function GrantForm({
  users,
  projects,
  permissions,
  onSuccess,
}: {
  users: UserOption[];
  projects: ProjectOption[];
  permissions: PermissionOption[];
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<GrantAccessInput>({
    resolver: zodResolver(grantAccessSchema),
    defaultValues: DEFAULTS,
  });

  function onSubmit(values: GrantAccessInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await grantProjectAccessAction(values);
      if ("error" in result) setServerError(result.error);
      else {
        form.reset(DEFAULTS);
        onSuccess();
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="user_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Grant to</FormLabel>
              <FormControl
                render={<UserPickerField value={field.value || null} onChange={field.onChange} options={users} />}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
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
        <FormField
          control={form.control}
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
        <FormField
          control={form.control}
          name="expires_at"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expires (optional)</FormLabel>
              <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Granting…" : "Grant access"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
