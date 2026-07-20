// Isomorphic (no server-only import) -- used by both the /delegations page (server) and its
// tests. Pure date-math, no DB access.

export type DelegationWindow = {
  starts_at: string;
  ends_at: string;
  revoked_at: string | null;
};

export type DelegationGroup = "active" | "upcoming" | "past";

/**
 * Classifies a delegation into the three display buckets the /delegations list groups by.
 * Mirrors `has_permission`'s own live-window check exactly
 * (`revoked_at is null and now >= starts_at and now < ends_at`,
 * 20260715000006_credentials_delegations.sql) so "Active" here always agrees with whether the
 * delegate's access is actually live right now. A revoked delegation is "past" even if its window
 * hasn't elapsed yet (revoke is immediate); an elapsed window is "past" even if never revoked.
 */
export function classifyDelegation(d: DelegationWindow, now: Date = new Date()): DelegationGroup {
  if (d.revoked_at) return "past";
  const nowMs = now.getTime();
  if (nowMs < new Date(d.starts_at).getTime()) return "upcoming";
  if (nowMs >= new Date(d.ends_at).getTime()) return "past";
  return "active";
}
