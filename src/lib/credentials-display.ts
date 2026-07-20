import type { DisplayCredentialRow } from "@/app/(app)/projects/[id]/credentials/types";

// Shared, display-only helpers for rendering credential rows -- used by both the project-scoped
// tab (projects/[id]/credentials) and the global cross-project index (/credentials). Neither
// caller ever uses these to gate access: RLS ("view credential metadata") already narrowed the
// rows to whatever this caller may see before either page gets them.

// The plain mask shown to everyone who lacks `reveal_credential` -- the real secret is never
// fetched for them at all (not even in a hidden field): CredentialRevealControl, the only thing
// that ever holds plaintext client-side, is never mounted for these rows.
export const MASK = "••••••••••••";

const EXPIRY_SOON_DAYS = 14;

/** null = not near expiry; "soon" = within EXPIRY_SOON_DAYS; "expired" = already past. Display
 * only -- never gates access, RLS/has_permission already own that. */
export function expiryStatus(expiresAt: string | null): "soon" | "expired" | null {
  if (!expiresAt) return null;
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= EXPIRY_SOON_DAYS) return "soon";
  return null;
}

/** Groups an already-RLS-filtered list of credentials by environment -- display-only, never a
 * filter (RLS already narrowed the rows to whatever this caller may see). Generic over T so
 * callers that decorate rows with extra display fields (e.g. the global index's project_name)
 * don't lose them through this helper. */
export function groupByEnvironment<T extends DisplayCredentialRow>(credentials: T[]) {
  const groups = new Map<DisplayCredentialRow["environment"], T[]>();
  for (const c of credentials) groups.set(c.environment, [...(groups.get(c.environment) ?? []), c]);
  return [...groups.entries()];
}

export const VISIBILITY_BADGE: Record<DisplayCredentialRow["visibility"], "outline" | "secondary" | "destructive"> = {
  project_members: "outline",
  pms_only: "secondary",
  admins_only: "destructive",
};
