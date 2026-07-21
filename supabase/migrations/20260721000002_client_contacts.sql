-- P2 client feedback: clients get MULTIPLE contact persons. New client_contacts table; the
-- legacy clients.contact_name/contact_email/phone columns stay for now and keep being synced
-- from the primary contact (views/pages elsewhere still read them) -- upsertClientAction owns
-- that sync.

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz default now()
);
create index client_contacts_client_idx on public.client_contacts (client_id);

alter table public.client_contacts enable row level security;

-- Same visibility as the parent clients table (20260715000003): anyone who may see clients may
-- see their contacts; writes are gated by manage_clients exactly like clients writes.
create policy "view client_contacts" on public.client_contacts
  for select using (public.has_permission(auth.uid(),'view_clients'));
create policy "manage client_contacts" on public.client_contacts
  for all using (public.has_permission(auth.uid(),'manage_clients'))
  with check (public.has_permission(auth.uid(),'manage_clients'));

-- Auto-expose is off -- explicit grants, as wide as the policies (same convention as every
-- other migration here).
grant select, insert, update, delete on public.client_contacts to authenticated;
grant select, insert, update, delete on public.client_contacts to service_role;

-- Backfill: every existing legacy contact becomes that client's primary contact row. On a live
-- DB this captures the real values; locally `clients` is still empty at migration time (demo
-- clients arrive via seed.sql, which re-runs this same backfill afterwards).
insert into public.client_contacts (client_id, name, email, phone, is_primary)
select id, contact_name, contact_email, phone, true
from public.clients
where contact_name is not null;
