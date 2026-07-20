import type { DelegationGroup } from "@/lib/delegations";

export type { DelegationGroup };

export type ProjectOption = { id: string; name: string };
export type PermissionOption = { key: string; description: string | null };
export type PersonOption = { user_id: string; full_name: string; avatar_url: string | null };

/** A `delegations` row enriched for display: resolved names/avatars for from_user/to_user, the
 * project + permission set attached via `delegation_permissions`, which display bucket it falls
 * in (see classifyDelegation), and whether the CURRENT viewer may revoke it (from_user or admin,
 * and only while not already revoked -- matches revokeDelegationAction's own check). */
export type DelegationListItem = {
  id: string;
  from_user: string;
  to_user: string;
  from_name: string;
  to_name: string;
  from_avatar: string | null;
  to_avatar: string | null;
  starts_at: string;
  ends_at: string;
  handover_notes: string | null;
  revoked_at: string | null;
  projects: ProjectOption[];
  permission_keys: string[];
  group: DelegationGroup;
  canRevoke: boolean;
};

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

export function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
