begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'avatars bucket exists and is public-read');
select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  2097152::bigint,
  'avatars bucket caps files at 2 MB');
-- H7 hardening (20260729000001): explicit raster allowlist -- `image/*` matched
-- image/svg+xml, and a script-bearing SVG in a public bucket is stored XSS.
select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/png','image/jpeg','image/webp','image/gif'],
  'avatars bucket only accepts raster images (no SVG)');

select * from finish();
rollback;
