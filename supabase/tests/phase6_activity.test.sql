begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Phase 6 Task 4: audit_logs SELECT policy keyed on has_permission(uid, 'view_audit'), additive to
-- the existing admin-only policy (20260714000001_phase1_auth.sql).
--
-- fixtures: an admin, a plain member, and a "viewer" whom we grant view_audit to via a
-- role_permissions row (rather than the user_roles=admin path) -- this is what proves the new
-- policy is genuinely keyed on the permission and not just a second way of spelling is_admin().
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('fc000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-admin@test.local','{"full_name":"Act Admin"}','{}','',now(),now()),
  ('fc000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-member@test.local','{"full_name":"Act Member"}','{}','',now(),now()),
  ('fc000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-viewer@test.local','{"full_name":"Act Viewer"}','{}','',now(),now());
update public.user_profiles set status = 'active' where id::text like 'fc000000-%';
insert into public.user_roles (user_id, role_key) values
  ('fc000000-0000-4000-8000-000000000001','admin'),
  ('fc000000-0000-4000-8000-000000000002','member'),
  ('fc000000-0000-4000-8000-000000000003','viewer');

-- grant view_audit to the 'viewer' role globally -- exercises the permission path, not is_admin()
insert into public.role_permissions (role_key, permission_key, scope) values ('viewer','view_audit','global');

-- 3 fixture audit rows, inserted as the table owner (bypasses RLS/grants, same pattern used by
-- every other pgTAP fixture in this suite -- audit_logs itself is append-only for every other role).
insert into public.audit_logs (actor_id, actor_email, action, resource_type, resource_id, metadata) values
  ('fc000000-0000-4000-8000-000000000001','act-admin@test.local','auth.login', 'user', 'fc000000-0000-4000-8000-000000000001', '{}'),
  ('fc000000-0000-4000-8000-000000000002','act-member@test.local','project.updated', 'project', 'fb000000-0000-4000-8000-000000000009', '{"project_id":"fb000000-0000-4000-8000-000000000009"}'),
  ('fc000000-0000-4000-8000-000000000003','act-viewer@test.local','credential.revealed', 'credential', 'fd000000-0000-4000-8000-000000000001', '{"project_id":"fb000000-0000-4000-8000-000000000009"}');

select is(public.has_permission('fc000000-0000-4000-8000-000000000001','view_audit'), true,
  'admin satisfies has_permission(view_audit) via is_admin() bypass');
select is(public.has_permission('fc000000-0000-4000-8000-000000000002','view_audit'), false,
  'plain member does NOT satisfy has_permission(view_audit)');
select is(public.has_permission('fc000000-0000-4000-8000-000000000003','view_audit'), true,
  'viewer holds view_audit via an explicit global role_permissions grant (permission-keyed, not admin-only)');

-- ===== as the admin: sees every row =====
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"fc000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.audit_logs), 3, 'admin reads all 3 fixture audit rows');
select throws_ok(
  $$ insert into public.audit_logs (action) values ('x') $$,
  '42501', null,
  'audit_logs stays append-only even for an admin (client-side insert still revoked)');

-- ===== as the plain member: zero rows (RLS), not a crash =====
set local "request.jwt.claims" to '{"sub":"fc000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.audit_logs), 0, 'member with no view_audit reads zero audit rows');

-- ===== as the view_audit-holding viewer: sees every row via the new policy =====
set local "request.jwt.claims" to '{"sub":"fc000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.audit_logs), 3,
  'non-admin view_audit holder reads all 3 fixture audit rows via the new policy');

select * from finish();
rollback;
