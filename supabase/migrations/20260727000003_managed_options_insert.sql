-- Inline "+ Add" in the person form's Role/Team comboboxes: anyone who can use that form
-- (manage_people) may grow the vocabulary. Curation/removal stays admin-only via the existing
-- "admins manage managed_options" policy (20260721000001) -- policies are permissive (OR-ed),
-- so this just adds an insert path beside it.
create policy "people managers add managed_options" on public.managed_options
  for insert with check (public.has_permission(auth.uid(), 'manage_people'));
