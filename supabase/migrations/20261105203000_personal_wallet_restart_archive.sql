-- Marco reversível de reinício exclusivo da Minha Carteira do proprietário.
-- Não exclui, altera, arquiva fisicamente ou regrava registros financeiros existentes.
create table if not exists public.personal_wallet_reset_archives (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  archived_at timestamptz not null default now(),
  hidden_ids jsonb not null,
  restored_at timestamptz,
  constraint personal_wallet_reset_archive_valid check (jsonb_typeof(hidden_ids)='object')
);
alter table public.personal_wallet_reset_archives enable row level security;
revoke all on public.personal_wallet_reset_archives from public, anon, authenticated;
grant select on public.personal_wallet_reset_archives to authenticated;
drop policy if exists wallet_reset_archive_owner_select on public.personal_wallet_reset_archives;
create policy wallet_reset_archive_owner_select
on public.personal_wallet_reset_archives for select to authenticated
using (owner_user_id=(select auth.uid()));

create or replace function public.personal_wallet_archive_for_restart()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_user uuid := auth.uid();
 v_snapshot jsonb;
begin
 if v_user is null or not public.is_platform_super_admin()
    or not exists(select 1 from public.capital_source_wallet_origin_access
       where owner_user_id=v_user) then
   raise exception 'Reinício reservado ao proprietário da carteira.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text, 590021));
 if exists(select 1 from public.personal_wallet_reset_archives
    where owner_user_id=v_user and restored_at is null) then
   raise exception 'A carteira já possui um reinício ativo.';
 end if;
 -- Não permite segundo reinício sem mecanismo adicional de composição de arquivos.
 if exists(select 1 from public.personal_wallet_reset_archives where owner_user_id=v_user) then
   raise exception 'Há um arquivo anterior. Restaure-o antes de outra operação.';
 end if;
 v_snapshot := jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_accounts where owner_user_id=v_user),
    'cards', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_cards where owner_user_id=v_user),
    'expenses', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_expenses where owner_user_id=v_user),
    'installments', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_expense_installments where owner_user_id=v_user),
    'invoicePayments', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_invoice_payments where owner_user_id=v_user),
    'accountOperations', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_account_operations where owner_user_id=v_user),
    'statementRows', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_statement_rows where owner_user_id=v_user),
    'payables', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_payables where owner_user_id=v_user),
    'payablePayments', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_payable_payments where owner_user_id=v_user),
    'recurringIncomes', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_recurring_incomes where user_id=v_user),
    'recurringReceipts', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_recurring_receipts where user_id=v_user),
    'recurringObligations', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_recurring_obligations where owner_user_id=v_user),
    'recurringObligationIssues', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_recurring_obligation_issues where owner_user_id=v_user),
    'cardInvoiceFacts', (select coalesce(jsonb_agg(id::text),'[]'::jsonb) from public.personal_wallet_card_invoice_facts where owner_user_id=v_user)
 );
 insert into public.personal_wallet_reset_archives(owner_user_id,hidden_ids)
 values(v_user,v_snapshot);
 return v_snapshot;
end $$;
revoke all on function public.personal_wallet_archive_for_restart() from public,anon;
grant execute on function public.personal_wallet_archive_for_restart() to authenticated;

create or replace function public.personal_wallet_restore_restart()
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or not public.is_platform_super_admin()
    or not exists(select 1 from public.capital_source_wallet_origin_access
       where owner_user_id=v_user) then
   raise exception 'Operação não autorizada.';
 end if;
 update public.personal_wallet_reset_archives set restored_at=now()
  where owner_user_id=v_user and restored_at is null;
 if not found then raise exception 'Nenhum reinício ativo para restaurar.'; end if;
 return true;
end $$;
revoke all on function public.personal_wallet_restore_restart() from public,anon;
grant execute on function public.personal_wallet_restore_restart() to authenticated;
