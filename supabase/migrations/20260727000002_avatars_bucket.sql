-- Person photo uploads (person form avatar picker). Public read: the resulting URL is stored
-- in people.avatar_url and rendered wherever that person appears -- exactly how the seeded
-- photo URLs already behave. Insert: any authenticated user -- the form is UX-gated to
-- manage_people and upsertPersonAction re-checks server-side; an orphaned upload by an
-- authenticated non-manager is harmless. Size/mime caps are enforced by Storage itself via the
-- bucket columns. No update/delete policies (YAGNI): replacing a photo uploads a new object
-- under a fresh uuid name.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/*'])
on conflict (id) do nothing;

create policy "public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "authenticated upload avatars" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');
