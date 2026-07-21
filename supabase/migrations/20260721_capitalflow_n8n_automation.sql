create extension if not exists pgcrypto;

create table if not exists public.n8n_automation_integrations (
  profile_id uuid primary key references public.perfis(id) on delete cascade,
  session_name text not null unique,
  secret_hash text not null check (length(secret_hash) = 64),
  active boolean not null default true,
  billing_enabled boolean not null default false,
  billing_hour smallint not null default 9 check (billing_hour between 8 and 18),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.n8n_message_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  client_id uuid references public.clientes(id) on delete set null,
  message_id text not null,
  phone_hash text not null,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  message_type text not null,
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'PROCESSED', 'IGNORED', 'ERROR')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, message_id, direction)
);

create table if not exists public.n8n_loan_leads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  client_id uuid references public.clientes(id) on delete set null,
  phone_hash text not null,
  full_name text,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'CLOSED')),
  created_at timestamptz not null default now()
);

create table if not exists public.n8n_handoffs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  client_id uuid references public.clientes(id) on delete set null,
  phone_hash text not null,
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.n8n_payment_promises (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  client_id uuid not null references public.clientes(id) on delete cascade,
  promised_for date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'FULFILLED', 'EXPIRED', 'CANCELLED')),
  created_at timestamptz not null default now()
);

create index if not exists n8n_message_events_profile_created_idx on public.n8n_message_events(profile_id, created_at desc);
create index if not exists n8n_handoffs_profile_status_idx on public.n8n_handoffs(profile_id, status);
create index if not exists n8n_payment_promises_active_idx on public.n8n_payment_promises(profile_id, client_id, promised_for) where status = 'ACTIVE';

alter table public.n8n_automation_integrations enable row level security;
alter table public.n8n_message_events enable row level security;
alter table public.n8n_loan_leads enable row level security;
alter table public.n8n_handoffs enable row level security;
alter table public.n8n_payment_promises enable row level security;

revoke all on public.n8n_automation_integrations from anon, authenticated;
revoke all on public.n8n_message_events from anon, authenticated;
revoke all on public.n8n_loan_leads from anon, authenticated;
revoke all on public.n8n_handoffs from anon, authenticated;
revoke all on public.n8n_payment_promises from anon, authenticated;
grant all on public.n8n_automation_integrations to service_role;
grant all on public.n8n_message_events to service_role;
grant all on public.n8n_loan_leads to service_role;
grant all on public.n8n_handoffs to service_role;
grant all on public.n8n_payment_promises to service_role;
