create table if not exists public.n8n_short_links (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{8,32}$'),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  target_url text not null check (target_url ~ '^https://'),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create index if not exists n8n_short_links_expiry_idx on public.n8n_short_links (expires_at);
alter table public.n8n_short_links enable row level security;
revoke all on public.n8n_short_links from public, anon, authenticated;
grant select, insert, delete on public.n8n_short_links to service_role;

