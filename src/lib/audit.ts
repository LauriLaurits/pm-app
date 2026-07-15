import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.signup"
  | "auth.session_revoked"
  | "auth.sessions_revoked_all"
  | "user.approved"
  | "user.status_changed"
  | "project.updated"
  | "project.status_posted";

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

/** Append to audit_logs via service role. Never throws — auditing must not break the flow. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const h = await headers();
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: h.get("user-agent") ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
    if (error) console.error("audit write failed:", error.message);
  } catch (e) {
    console.error("audit write failed:", e);
  }
}
