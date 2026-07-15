-- Phase 2 (4/5): budgets. Financial column-gating via table separation:
--   part_billing  = client-facing money  -> view_budget
--   part_costs    = internal money       -> view_internal_cost (finance only)

create type public.budget_item_type as enum ('planned_cost','actual_cost','invoice','payment','change');

create table public.part_billing (
  part_id uuid primary key references public.project_parts (id) on delete cascade,
  fixed_amount numeric(12,2),
  hourly_rate numeric(10,2),
  client_price numeric(12,2),
  currency char(3) not null default 'EUR',
  updated_at timestamptz not null default now()
);

create table public.part_costs (
  part_id uuid primary key references public.project_parts (id) on delete cascade,
  planned_internal_cost numeric(12,2),
  actual_internal_cost numeric(12,2),
  currency char(3) not null default 'EUR',
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  part_id uuid references public.project_parts (id) on delete cascade,
  currency char(3) not null default 'EUR',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, part_id)
);
-- unique(project_id, part_id) doesn't constrain rows where part_id is null (NULLs are
-- never equal), so a project could otherwise get more than one project-level budget.
create unique index budgets_project_only_uidx on public.budgets (project_id) where part_id is null;

create table public.budget_items (
  id bigint generated always as identity primary key,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  item_type public.budget_item_type not null,
  name text not null,
  amount numeric(12,2) not null,
  occurred_on date not null default current_date,
  note text,
  created_by uuid references public.user_profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index budget_items_budget_idx on public.budget_items (budget_id, occurred_on);

create trigger part_billing_updated_at before update on public.part_billing for each row execute function public.set_updated_at();
create trigger part_costs_updated_at before update on public.part_costs for each row execute function public.set_updated_at();
create trigger budgets_updated_at before update on public.budgets for each row execute function public.set_updated_at();

-- helper: project of a part (for policies on part-scoped financial tables)
create or replace function public.part_project(p_part uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.project_parts where id = p_part
$$;
revoke all on function public.part_project(uuid) from public, anon;
grant execute on function public.part_project(uuid) to authenticated;

-- ---------- RLS ----------

alter table public.part_billing enable row level security;
alter table public.part_costs enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;

create policy "view part billing" on public.part_billing for select using (public.has_permission(auth.uid(),'view_budget', public.part_project(part_id)));
create policy "manage part billing" on public.part_billing for all using (public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id))) with check (public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id)));

-- NOTE: has_permission's project argument must be passed here. Its global branch ignores
-- the project argument entirely, so finance's GLOBAL view_internal_cost grant still passes
-- unchanged; but a per-project explicit grant (via user_project_permissions) would otherwise
-- match part_costs rows for EVERY project, not just the granted one.
create policy "finance views part costs" on public.part_costs for select using (
  public.has_permission(auth.uid(),'view_internal_cost', public.part_project(part_id)));
create policy "finance manages part costs" on public.part_costs for all using (
  public.has_permission(auth.uid(),'view_internal_cost', public.part_project(part_id))
  and public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id)))
with check (
  public.has_permission(auth.uid(),'view_internal_cost', public.part_project(part_id))
  and public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id)));

create policy "view budgets" on public.budgets for select using (public.has_permission(auth.uid(),'view_budget', project_id));
create policy "manage budgets" on public.budgets for all using (public.has_permission(auth.uid(),'manage_budget', project_id)) with check (public.has_permission(auth.uid(),'manage_budget', project_id));

create policy "view budget items" on public.budget_items for select using (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'view_budget', b.project_id)));
-- Attribution binds at INSERT (created_by = auth.uid(), enforced by WITH CHECK below; the
-- column default fills it in when the insert omits it, but an explicit different value
-- spoofing another user is rejected) and is immutable afterwards -- enforced not by UPDATE's
-- WITH CHECK (which would re-validate the row's ORIGINAL created_by against the current actor
-- on every update, blocking a manager from updating items they didn't personally create) but
-- by withholding UPDATE privilege on the created_by column entirely (see grants below).
-- Service-role/seed inserts bypass RLS entirely, so they are unaffected.
create policy "insert budget items" on public.budget_items for insert
  with check (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id)) and budget_items.created_by = auth.uid());
create policy "update budget items" on public.budget_items for update
  using (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id)))
  with check (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id)));
create policy "delete budget items" on public.budget_items for delete
  using (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id)));

-- ---------- grants ----------
grant select, insert, update, delete on public.part_billing, public.part_costs, public.budgets to authenticated;
grant select, insert, update, delete on public.part_billing, public.part_costs, public.budgets to service_role;
grant select, insert, delete on public.budget_items to authenticated;
-- No UPDATE privilege on created_by/budget_id: attribution can't be rewritten, and items
-- can't be silently moved to another budget.
grant update (item_type, name, amount, occurred_on, note) on public.budget_items to authenticated;
grant select, insert, update, delete on public.budget_items to service_role;
