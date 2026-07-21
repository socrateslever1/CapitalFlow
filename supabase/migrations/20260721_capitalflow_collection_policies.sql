create table if not exists public.n8n_collection_policies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  loan_id uuid references public.contratos(id) on delete cascade,
  enabled boolean not null default false,
  overdue_cadence text not null default 'MANUAL' check (overdue_cadence in ('MANUAL','DAILY','WEEKLY')),
  tone text not null default 'CORDIAL' check (tone in ('CORDIAL','OBJECTIVE','MEDIATOR','FIRM_RESPECTFUL')),
  remind_two_days_before boolean not null default true,
  remind_due_today boolean not null default true,
  remind_first_overdue_day boolean not null default true,
  send_hour smallint not null default 9 check (send_hour between 8 and 18),
  max_consecutive_messages smallint not null default 10 check (max_consecutive_messages between 1 and 30),
  paused boolean not null default false,
  pause_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists n8n_collection_policy_profile_default_ux
  on public.n8n_collection_policies(profile_id) where loan_id is null;
create unique index if not exists n8n_collection_policy_profile_loan_ux
  on public.n8n_collection_policies(profile_id, loan_id) where loan_id is not null;

create table if not exists public.n8n_collection_dispatches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  loan_id uuid not null references public.contratos(id) on delete cascade,
  installment_id uuid not null references public.parcelas(id) on delete cascade,
  stage text not null check (stage in ('DUE_MINUS_2','DUE_TODAY','OVERDUE')),
  scheduled_date date not null,
  phone_hash text not null,
  amount numeric not null check (amount >= 0),
  days_late integer not null default 0,
  tone text not null,
  message text not null,
  status text not null default 'QUEUED' check (status in ('PREVIEW','QUEUED','SENT','ERROR','CANCELLED')),
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(profile_id, installment_id, stage, scheduled_date)
);

create index if not exists n8n_collection_dispatches_profile_date_idx
  on public.n8n_collection_dispatches(profile_id, scheduled_date desc);

alter table public.n8n_collection_policies enable row level security;
alter table public.n8n_collection_dispatches enable row level security;

create policy n8n_collection_policies_owner_all on public.n8n_collection_policies
for all to authenticated
using (exists (select 1 from public.perfis p where p.id = profile_id and (p.user_id = (select auth.uid()) or p.email = (select auth.jwt() ->> 'email') or p.usuario_email = (select auth.jwt() ->> 'email'))))
with check (exists (select 1 from public.perfis p where p.id = profile_id and (p.user_id = (select auth.uid()) or p.email = (select auth.jwt() ->> 'email') or p.usuario_email = (select auth.jwt() ->> 'email'))));

create policy n8n_collection_dispatches_owner_select on public.n8n_collection_dispatches
for select to authenticated
using (exists (select 1 from public.perfis p where p.id = profile_id and (p.user_id = (select auth.uid()) or p.email = (select auth.jwt() ->> 'email') or p.usuario_email = (select auth.jwt() ->> 'email'))));

revoke all on public.n8n_collection_policies, public.n8n_collection_dispatches from anon;
grant select, insert, update, delete on public.n8n_collection_policies to authenticated, service_role;
grant select on public.n8n_collection_dispatches to authenticated;
grant all on public.n8n_collection_dispatches to service_role;

insert into public.n8n_collection_policies(profile_id, enabled, overdue_cadence, tone)
select profile_id, false, 'MANUAL', 'CORDIAL'
from public.n8n_automation_integrations
where active = true
on conflict do nothing;
