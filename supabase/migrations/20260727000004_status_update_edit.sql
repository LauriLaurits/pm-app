-- User decision (2026-07-27): status updates are no longer immutable -- the author may edit
-- or delete their own update (typo fixes, wrong-field pastes). Admin delete stays. This
-- deliberately reverses the "IMMUTABLE (no update policy)" design in 20260715000003 --
-- docs/schema.md is updated in the same commit.
create policy "authors edit own status update" on public.project_status_updates
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete own status update" on public.project_status_updates
  for delete using (author_id = auth.uid());
grant update on public.project_status_updates to authenticated;
