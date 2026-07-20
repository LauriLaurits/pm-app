-- Phase 6 Task 4 (activity log viewer): audit_logs is currently readable only via the
-- "admins read audit logs" policy (is_admin() bypass, migration 20260714000001). The spec calls
-- for gating the /activity page on the `view_audit` permission specifically, so this adds a
-- second, additive SELECT policy keyed on has_permission(..., 'view_audit') instead of hardcoding
-- admin -- multiple permissive RLS policies on the same table are OR'd together, so this only ever
-- widens (never narrows) who can read, and the existing admin policy stays as a harmless overlap.
--
-- Note: `view_audit` has zero role_permissions rows in the catalog (20260715000002_permission_model
-- .sql) and is not project-scoped, so has_permission(uid, 'view_audit') with no project argument is
-- satisfied ONLY by the is_admin() bypass today -- i.e. in practice this policy currently grants
-- the exact same population as the existing admin-only one. Writing it against the permission (per
-- spec) means granting `view_audit` to a role in the future extends read access with no further
-- migration needed. No insert/update/delete policy is added anywhere -- audit_logs stays
-- append-only, writable only by the service role (unchanged from Phase 1).
create policy "view_audit holders read audit logs" on public.audit_logs
  for select using (public.has_permission(auth.uid(), 'view_audit'));
