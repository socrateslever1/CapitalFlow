create table if not exists public.user_modulos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo_chave text not null check (length(btrim(modulo_chave)) between 1 and 80),
  ativo boolean not null default true,
  configuracoes jsonb not null default '{}'::jsonb check (jsonb_typeof(configuracoes) = 'object'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, modulo_chave)
);

alter table public.user_modulos enable row level security;

create index if not exists idx_user_modulos_lookup
  on public.user_modulos (user_id, modulo_chave);

create or replace function public.touch_user_modulos_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_user_modulos_updated_at on public.user_modulos;
create trigger trg_user_modulos_updated_at
before update on public.user_modulos
for each row execute function public.touch_user_modulos_atualizado_em();

drop policy if exists "user_modulos_select_own" on public.user_modulos;
create policy "user_modulos_select_own"
on public.user_modulos for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "user_modulos_insert_own" on public.user_modulos;
create policy "user_modulos_insert_own"
on public.user_modulos for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "user_modulos_update_own" on public.user_modulos;
create policy "user_modulos_update_own"
on public.user_modulos for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "user_modulos_delete_own" on public.user_modulos;
create policy "user_modulos_delete_own"
on public.user_modulos for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.user_modulos from anon, public;
grant select, insert, update, delete on table public.user_modulos to authenticated;
revoke all on function public.touch_user_modulos_atualizado_em() from public, anon;
grant execute on function public.touch_user_modulos_atualizado_em() to authenticated;

insert into public.user_modulos (user_id, modulo_chave, ativo)
select id, 'carteira', true from auth.users
on conflict (user_id, modulo_chave) do nothing;

do $$
declare
  wallet_table text;
begin
  foreach wallet_table in array array[
    'personal_wallet_accounts',
    'personal_wallet_cards',
    'personal_wallet_expenses',
    'personal_wallet_expense_installments',
    'personal_wallet_invoice_payments',
    'personal_wallet_account_operations',
    'personal_wallet_statement_rows',
    'personal_wallet_payables',
    'personal_wallet_payable_payments',
    'personal_wallet_recurring_incomes',
    'personal_wallet_recurring_receipts',
    'personal_wallet_recurring_obligations',
    'personal_wallet_recurring_obligation_issues'
  ] loop
    if to_regclass(format('public.%I', wallet_table)) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = wallet_table
       ) then
      execute format('alter publication supabase_realtime add table public.%I', wallet_table);
    end if;
  end loop;
end;
$$;
