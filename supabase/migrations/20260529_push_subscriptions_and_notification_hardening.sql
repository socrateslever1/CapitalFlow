create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (profile_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
using (
  profile_id in (
    select id from public.perfis where user_id = auth.uid()
    union
    select id from public.perfis where supervisor_id in (
      select id from public.perfis where user_id = auth.uid()
    )
  )
);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
with check (
  profile_id in (
    select id from public.perfis where user_id = auth.uid()
    union
    select id from public.perfis where supervisor_id in (
      select id from public.perfis where user_id = auth.uid()
    )
  )
);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
using (
  profile_id in (
    select id from public.perfis where user_id = auth.uid()
    union
    select id from public.perfis where supervisor_id in (
      select id from public.perfis where user_id = auth.uid()
    )
  )
)
with check (
  profile_id in (
    select id from public.perfis where user_id = auth.uid()
    union
    select id from public.perfis where supervisor_id in (
      select id from public.perfis where user_id = auth.uid()
    )
  )
);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
on public.push_subscriptions
for delete
using (
  profile_id in (
    select id from public.perfis where user_id = auth.uid()
    union
    select id from public.perfis where supervisor_id in (
      select id from public.perfis where user_id = auth.uid()
    )
  )
);

create index if not exists idx_push_subscriptions_profile_id
on public.push_subscriptions(profile_id);

create index if not exists idx_notificacoes_profile_unread
on public.notificacoes(profile_id, read_at, created_at desc);
