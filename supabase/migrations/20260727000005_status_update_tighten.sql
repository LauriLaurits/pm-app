-- Tighten 20260727000004: the table-wide update grant let an author PATCH project_id /
-- created_at directly via PostgREST (cross-project injection, history backdating). Column-
-- scope the grant to the six content fields and require live edit_status on the owning
-- project for both update and author-delete -- same defense-in-depth the original
-- immutability design used.
revoke update on public.project_status_updates from authenticated;
grant update (completed, in_progress, blockers, decisions_needed, next_milestone, handover_info)
  on public.project_status_updates to authenticated;

drop policy "authors edit own status update" on public.project_status_updates;
create policy "authors edit own status update" on public.project_status_updates
  for update
  using (author_id = auth.uid() and public.has_permission(auth.uid(), 'edit_status', project_id))
  with check (author_id = auth.uid() and public.has_permission(auth.uid(), 'edit_status', project_id));

drop policy "authors delete own status update" on public.project_status_updates;
create policy "authors delete own status update" on public.project_status_updates
  for delete using (author_id = auth.uid() and public.has_permission(auth.uid(), 'edit_status', project_id));
