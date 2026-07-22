create table if not exists public.whatsapp_admin_users (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  phone_hash text not null check (length(phone_hash) = 64),
  display_name text not null default 'Administrador',
  role text not null default 'ADMIN' check (role in ('OWNER','ADMIN','OPERATOR','VIEWER')),
  permissions text[] not null default array['READ','CHARGE','AUTOMATION']::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, phone_hash)
);

create table if not exists public.whatsapp_admin_commands (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  admin_user_id uuid not null references public.whatsapp_admin_users(id) on delete cascade,
  intent text not null,
  payload jsonb not null default '{}'::jsonb,
  confirmation_code text,
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','EXECUTED','CANCELLED','EXPIRED','ERROR')),
  result jsonb,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_admin_commands_pending_idx
  on public.whatsapp_admin_commands(profile_id, admin_user_id, created_at desc)
  where status = 'PENDING';

alter table public.whatsapp_admin_users enable row level security;
alter table public.whatsapp_admin_commands enable row level security;

revoke all on public.whatsapp_admin_users, public.whatsapp_admin_commands from anon, authenticated;
grant all on public.whatsapp_admin_users, public.whatsapp_admin_commands to service_role;

create policy whatsapp_admin_users_owner_read on public.whatsapp_admin_users
for select to authenticated
using (exists (
  select 1 from public.perfis p
  where p.id = profile_id
    and (p.user_id = (select auth.uid()) or p.email = (select auth.jwt() ->> 'email') or p.usuario_email = (select auth.jwt() ->> 'email'))
));

grant select on public.whatsapp_admin_users to authenticated;