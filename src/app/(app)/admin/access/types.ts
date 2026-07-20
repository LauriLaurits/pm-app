export type ProjectOption = { id: string; name: string };
export type PermissionOption = { key: string; description: string | null };
export type UserOption = { user_id: string; full_name: string; avatar_url: string | null };

/** A `user_project_permissions` row enriched for display: resolved names for the grantee and the
 * granter, and whether it's past its expiry (the row itself isn't auto-deleted on expiry --
 * has_permission just stops honoring it -- so "expired" is purely a display/cleanup signal, not a
 * different state the DB tracks). */
export type GrantListItem = {
  id: number;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  project_id: string;
  project_name: string;
  permission_key: string;
  granted_by_name: string | null;
  granted_at: string;
  expires_at: string | null;
  isExpired: boolean;
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
