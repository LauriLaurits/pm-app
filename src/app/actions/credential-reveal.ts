"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

type RevealResult = { secret: string } | { error: string };

const GENERIC_ERROR = { error: "Could not reveal." } as const;

/**
 * Decrypts a credential's Vault secret for display, gated on `reveal_credential` for the
 * credential's project. Every branch that can fail (bad id, requirePermission throwing, the RPC
 * rejecting, an unexpected shape back) returns the SAME generic message -- never the underlying
 * reason, and never the secret itself. The RPC (public.reveal_credential_secret, see
 * 20260720000002_reveal_credential_rpc.sql) re-checks the permission itself server-side, so this
 * requirePermission call is UX-early-exit, not the only gate -- but it must still run first
 * (spec: every mutation requirePermission-first) so an unauthorized caller never even reaches
 * the RLS'd client/RPC round-trip.
 *
 * Goes through the normal RLS'd client (createClient), not the admin/service-role client -- the
 * `vault` schema itself is never touched here; the SECURITY DEFINER RPC does that on the
 * caller's behalf after re-checking the permission, exactly like create_credential_secret does
 * for writes.
 */
export async function revealCredentialAction(
  projectId: string,
  credentialId: string
): Promise<RevealResult> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(credentialId).success) {
    return GENERIC_ERROR;
  }

  try {
    const current = await requirePermission("reveal_credential", projectId);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reveal_credential_secret", { cred_id: credentialId });
    if (error || typeof data !== "string" || data.length === 0) {
      // Never surface `error.message` here -- Postgres exception text is an internal detail,
      // not something to hand back to the client. Same reasoning as the generic catch below.
      return GENERIC_ERROR;
    }

    // Audit AFTER the secret is already fetched, and BEFORE returning it -- metadata only, the
    // secret itself never appears here (or anywhere in this file: no console.log of `data`).
    await writeAudit({
      action: "credential.revealed",
      actorId: current.user.id,
      actorEmail: current.profile.email,
      resourceType: "credential",
      resourceId: credentialId,
      metadata: { project_id: projectId },
    });

    return { secret: data };
  } catch {
    // Covers requirePermission's "Not authorized" throw and anything else unexpected. Same
    // generic message either way -- a caller must never learn WHY a reveal was refused.
    return GENERIC_ERROR;
  }
}

/**
 * Best-effort audit trail for "the user copied a revealed secret to their clipboard" -- fired
 * from the client after a successful `navigator.clipboard.writeText`, so the clipboard write
 * itself always happens regardless of whether this call succeeds. Still requirePermission-first
 * (only a reveal_credential holder could have gotten a secret to copy in the first place), but
 * any failure here is swallowed: a copy audit gap must never surface as a UI error over an
 * action that, from the user's perspective, already succeeded.
 */
export async function copyCredentialAction(projectId: string, credentialId: string): Promise<void> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(credentialId).success) return;
  try {
    const current = await requirePermission("reveal_credential", projectId);
    await writeAudit({
      action: "credential.copied",
      actorId: current.user.id,
      actorEmail: current.profile.email,
      resourceType: "credential",
      resourceId: credentialId,
      metadata: { project_id: projectId },
    });
  } catch {
    // best-effort -- see doc comment above
  }
}
