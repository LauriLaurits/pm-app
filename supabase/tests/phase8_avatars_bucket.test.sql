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
select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/*'],
  'avatars bucket only accepts images');

select * from finish();
rollback;
