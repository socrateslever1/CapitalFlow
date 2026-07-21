create table if not exists public.n8n_client_sessions (
  profile_id uuid not null references public.perfis(id) on delete cascade,
  phone_hash text not null,
  client_id uuid not null references public.clientes(id) on delete cascade,
  verified_by text not null check (verified_by in ('PHONE', 'CPF', 'CODE', 'NAME')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, phone_hash)
);

alter table public.n8n_client_sessions enable row level security;
revoke all on public.n8n_client_sessions from anon, authenticated;
grant all on public.n8n_client_sessions to service_role;
create index if not exists n8n_client_sessions_expiry_idx on public.n8n_client_sessions(expires_at);
