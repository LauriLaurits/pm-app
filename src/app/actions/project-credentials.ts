"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { credentialSchema, type CredentialInput } from "@/lib/validation/project";

type ActionResult = { error: string } | { success: true; id: string };

export async function addCredentialAction(
  projectId: string,
  input: CredentialInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_credentials on
  // this project. Must run before any validation/DB work, and before the Vault write below --
  // Vault has no RLS of its own, so this requirePermission call is the only gate standing
  // between an arbitrary caller and creating secrets.
  const current = await requirePermission("manage_credentials", projectId);

  const parsed = credentialSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid credential details." };
  const { secret, ...metadata } = parsed.data;

  // Vault write MUST go through the service-role/admin client: the `vault` schema is not in
  // api.schemas (supabase/config.toml exposes only public + graphql_public), so even with the
  // service-role key, supabase-js can only reach it via the public.create_credential_secret
  // SECURITY DEFINER wrapper added in 20260716000001_credential_secret_rpc.sql -- which itself
  // revokes execute from anon/authenticated, so only this admin-client call can invoke it.
  // The name only needs to be unique in vault.secrets, never shown to a user -- it's not the
  // credential's display name (parsed.data.name is that, stored in public.credentials).
  const admin = createAdminClient();
  const vaultName = `cred:${projectId}:${crypto.randomUUID()}`;
  const { data: secretId, error: vaultError } = await admin.rpc("create_credential_secret", {
    secret,
    secret_name: vaultName,
    secret_description: `credential "${metadata.name}" on project ${projectId}`,
  });
  if (vaultError || !secretId) return { error: "Could not store the secret. Try again." };

  // Insert through the normal RLS'd client (not admin) -- the "insert credentials" policy
  // re-checks manage_credentials + the admins_only visibility gate itself, so this stays
  // consistent with every other mutation in the app going through RLS, not around it.
  const supabase = await createClient();
  const { data: credential, error } = await supabase
    .from("credentials")
    .insert({ project_id: projectId, owner_id: current.user.id, secret_id: secretId, ...metadata })
    .select("id")
    .single();
  // Note: if this insert fails, the Vault secret above is left orphaned (no credentials row
  // ever points at it). Same tradeoff as deleteCredentialAction's orphaned-secret-on-delete
  // below -- cleaning it up needs another admin-only Vault RPC, deferred as out of scope for
  // this phase (no secret reveal/rotation exists yet either).
  if (error || !credential) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "credential.added",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "credential",
    resourceId: credential.id,
    // Never log the secret itself -- only non-sensitive metadata.
    metadata: {
      project_id: projectId,
      type: metadata.type,
      environment: metadata.environment,
      visibility: metadata.visibility,
    },
  });

  revalidatePath(`/projects/${projectId}/credentials`);
  return { success: true as const, id: credential.id };
}

export async function deleteCredentialAction(
  projectId: string,
  credentialId: string
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(credentialId).success) return { error: "Invalid credential." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_credentials on
  // this project. Must run before any DB work.
  const current = await requirePermission("manage_credentials", projectId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("credentials")
    .delete()
    .eq("id", credentialId)
    .eq("project_id", projectId);
  if (error) return { error: "Delete failed. Try again." };

  // The row's vault.secrets entry is intentionally left in place -- there's no reveal/rotate
  // path yet (that's a later, higher-security phase) and no admin-only "delete secret" RPC
  // exists, so cleaning it up now would need building one just for this. An orphaned Vault
  // secret is inert (never referenced, never surfaced anywhere) so leaving it is safe.
  await writeAudit({
    action: "credential.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "credential",
    resourceId: credentialId,
    metadata: { project_id: projectId },
  });

  revalidatePath(`/projects/${projectId}/credentials`);
  return { success: true as const };
}
