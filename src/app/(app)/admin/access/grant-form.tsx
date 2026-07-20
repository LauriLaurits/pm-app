"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { grantProjectAccessAction } from "@/app/actions/access";
import { grantAccessSchema, type GrantAccessInput } from "@/lib/validation/access";
import { FormSection } from "@/components/form-section";
import { UserPickerField } from "./user-picker-field";
import { ExpiresField, PermissionsField, ProjectSelectField } from "./grant-form-fields";
import type { PermissionOption, ProjectOption, UserOption } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormSection first title="Who gets access" description="Pick the user who should gain access to a project.">
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
        </FormSection>

        <FormSection title="Which project" description="The permissions below apply to this project only.">
          <ProjectSelectField control={form.control} projects={projects} />
        </FormSection>

        <FormSection
          title="What they can do"
          description="Only permissions that are safe to grant directly are available."
        >
          <PermissionsField control={form.control} permissions={permissions} />
        </FormSection>

        <FormSection title="When it ends" description="Leave blank for access that doesn't expire on its own.">
          <ExpiresField control={form.control} />
        </FormSection>

        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Granting…" : "Grant access"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
