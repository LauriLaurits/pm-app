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
  | "user.role_changed"
  | "project.created"
  | "project.updated"
  | "project.status_posted"
  | "project.archived"
  | "project.deleted"
  | "part.upserted"
  | "part.deleted"
  | "part_billing.updated"
  | "part_costs.updated"
  | "budget_item.added"
  | "budget_item.deleted"
  | "member.added"
  | "member.updated"
  | "member.removed"
  | "link.upserted"
  | "link.deleted"
  | "credential.added"
  | "credential.updated"
  | "credential.deleted"
  | "time.logged"
  | "time.updated"
  | "time.deleted"
  | "person.created"
  | "person.updated"
  | "person.deleted"
  | "person_skill.added"
  | "person_skill.removed"
  | "time_off.upserted"
  | "time_off.deleted"
  | "client.created"
  | "client.updated"
  | "client.deleted";

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
