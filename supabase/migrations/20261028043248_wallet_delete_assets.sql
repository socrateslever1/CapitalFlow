-- Exclusão segura de contas e cartões sem destruir histórico financeiro.
-- Ativos com vínculos contábeis precisam ser desvinculados/corrigidos antes da exclusão.

create or replace function public.personal_wallet_delete_account(
  p_account_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_account public.personal_wallet_accounts%rowtype;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso não autorizado.';
  end if;
  if p_account_id is null or p_request_id is null then
    raise exception 'Conta e identificador da solicitação são obrigatórios.';
  end if;

  select * into v_account
    from public.personal_wallet_accounts
   where id = p_account_id and owner_user_id = v_user
   for update;

  if not found then
    return jsonb_build_object('deleted', true, 'id', p_account_id, 'replayed', true);
  end if;
  if coalesce(v_account.balance, 0) <> 0 then
    raise exception 'Zere o saldo da conta antes de excluí-la.';
  end if;
  if exists (select 1 from public.personal_wallet_account_operations where from_account_id = p_account_id or to_account_id = p_account_id)
     or exists (select 1 from public.personal_wallet_invoice_payments where account_id = p_account_id)
     or exists (select 1 from public.personal_wallet_expenses where account_id = p_account_id)
     or exists (select 1 from public.personal_wallet_recurring_incomes where destination_account_id = p_account_id)
     or exists (select 1 from public.personal_wallet_recurring_obligations where origin_account_id = p_account_id)
     or exists (select 1 from public.personal_wallet_payables where origin_account_id = p_account_id)
     or exists (select 1 from public.personal_wallet_payable_payments where account_id = p_account_id)
     or exists (select 1 from public.personal_wallet_cards where account_id = p_account_id) then
    raise exception 'Esta conta possui movimentações ou vínculos. Remova os vínculos antes de excluí-la.';
  end if;
  if exists (select 1 from public.personal_wallet_statement_rows where target_kind = 'ACCOUNT' and target_id = p_account_id) then
    raise exception 'Esta conta possui linhas importadas no extrato. Remova-as antes de excluir a conta.';
  end if;

  update public.user_modulos
     set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
         atualizado_em = now()
   where user_id = v_user and modulo_chave = 'carteira';

  delete from public.personal_wallet_accounts
   where id = p_account_id and owner_user_id = v_user;

  return jsonb_build_object('deleted', true, 'id', p_account_id, 'request_id', p_request_id);
end;
$$;

create or replace function public.personal_wallet_delete_card(
  p_card_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_card public.personal_wallet_cards%rowtype;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso não autorizado.';
  end if;
  if p_card_id is null or p_request_id is null then
    raise exception 'Cartão e identificador da solicitação são obrigatórios.';
  end if;

  select * into v_card
    from public.personal_wallet_cards
   where id = p_card_id and owner_user_id = v_user
   for update;

  if not found then
    return jsonb_build_object('deleted', true, 'id', p_card_id, 'replayed', true);
  end if;
  if coalesce(v_card.used_limit, 0) <> 0 or coalesce(v_card.current_bill, 0) <> 0
     or coalesce(v_card.opening_unallocated_amount, 0) <> 0
     or coalesce(v_card.initial_future_installments_balance, 0) <> 0 then
    raise exception 'Quite ou ajuste a fatura e o limite utilizado antes de excluir o cartão.';
  end if;
  if exists (select 1 from public.personal_wallet_invoice_payments where card_id = p_card_id)
     or exists (select 1 from public.personal_wallet_expenses where card_id = p_card_id)
     or exists (select 1 from public.personal_wallet_recurring_obligations where origin_card_id = p_card_id)
     or exists (select 1 from public.personal_wallet_payables where origin_card_id = p_card_id)
     or exists (select 1 from public.personal_wallet_payable_payments where card_id = p_card_id) then
    raise exception 'Este cartão possui faturas, lançamentos ou vínculos. Remova-os antes de excluir o cartão.';
  end if;
  if exists (select 1 from public.personal_wallet_statement_rows where target_kind = 'CARD' and target_id = p_card_id) then
    raise exception 'Este cartão possui linhas importadas no extrato. Remova-as antes de excluir o cartão.';
  end if;

  delete from public.personal_wallet_cards
   where id = p_card_id and owner_user_id = v_user;

  return jsonb_build_object('deleted', true, 'id', p_card_id, 'request_id', p_request_id);
end;
$$;

-- A carteira física nasce uma única vez. Depois de excluída, só volta por ação explícita do usuário.
create or replace function public.personal_wallet_ensure_default_cash_account()
returns public.personal_wallet_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_account public.personal_wallet_accounts%rowtype;
  v_initialized boolean := false;
begin
  if v_owner is null then raise exception 'Sessão não encontrada.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('personal_wallet_cash:' || v_owner::text, 0));

  select coalesce((configuracoes->>'wallet_cash_initialized')::boolean, false)
    into v_initialized
    from public.user_modulos
   where user_id = v_owner and modulo_chave = 'carteira';

  select * into v_account
    from public.personal_wallet_accounts
   where owner_user_id = v_owner and account_type = 'CASH'
   order by created_at asc
   limit 1
   for update;

  if found then
    update public.user_modulos
       set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
           atualizado_em = now()
     where user_id = v_owner and modulo_chave = 'carteira';
    return v_account;
  end if;

  if v_initialized then return null; end if;

  insert into public.personal_wallet_accounts(owner_user_id, nickname, bank_name, account_type, balance)
  values (v_owner, 'Carteira física', null, 'CASH', 0)
  returning * into v_account;

  update public.user_modulos
     set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
         atualizado_em = now()
   where user_id = v_owner and modulo_chave = 'carteira';
  return v_account;
end;
$$;

drop function if exists public.personal_wallet_archive_account(uuid, uuid);
drop function if exists public.personal_wallet_archive_card(uuid, uuid);

revoke all on function public.personal_wallet_delete_account(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_delete_account(uuid, uuid) to authenticated;
revoke all on function public.personal_wallet_delete_card(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_delete_card(uuid, uuid) to authenticated;
revoke all on function public.personal_wallet_ensure_default_cash_account() from public, anon;
grant execute on function public.personal_wallet_ensure_default_cash_account() to authenticated;

NOTIFY pgrst, 'reload schema';
