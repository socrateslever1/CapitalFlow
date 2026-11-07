-- Arquivamento e exclusão são operações diferentes:
-- arquivar preserva o histórico; excluir remove somente ativos sem vínculos.

alter table public.personal_wallet_accounts
  add column if not exists archived_at timestamptz;

create or replace function public.personal_wallet_archive_account(
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

  if not found then raise exception 'Conta não encontrada.'; end if;
  if v_account.archived_at is not null then
    return jsonb_build_object('archived', true, 'id', p_account_id, 'replayed', true);
  end if;
  if coalesce(v_account.balance, 0) <> 0 then
    raise exception 'Zere o saldo da conta antes de arquivá-la.';
  end if;
  if exists (
    select 1 from public.personal_wallet_cards
     where account_id = p_account_id and owner_user_id = v_user
       and upper(coalesce(status, 'ACTIVE')) <> 'CANCELED'
  ) then
    raise exception 'Arquive ou desvincule os cartões ativos desta conta antes de arquivá-la.';
  end if;

  update public.personal_wallet_accounts
     set archived_at = now()
   where id = p_account_id and owner_user_id = v_user;

  update public.user_modulos
     set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
         atualizado_em = now()
   where user_id = v_user and modulo_chave = 'carteira';

  return jsonb_build_object('archived', true, 'id', p_account_id, 'request_id', p_request_id);
end;
$$;

create or replace function public.personal_wallet_archive_card(
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

  if not found then raise exception 'Cartão não encontrado.'; end if;
  if upper(coalesce(v_card.status, '')) = 'CANCELED' then
    return jsonb_build_object('archived', true, 'id', p_card_id, 'replayed', true);
  end if;
  if coalesce(v_card.used_limit, 0) <> 0 or coalesce(v_card.current_bill, 0) <> 0
     or coalesce(v_card.opening_unallocated_amount, 0) <> 0
     or coalesce(v_card.initial_future_installments_balance, 0) <> 0 then
    raise exception 'Quite ou ajuste a fatura e os compromissos futuros antes de arquivar o cartão.';
  end if;
  if exists (
    select 1
      from public.personal_wallet_expenses e
      join public.personal_wallet_expense_installments i on i.expense_id = e.id
     where e.card_id = p_card_id and e.owner_user_id = v_user
       and upper(coalesce(i.status, 'PENDING')) = 'PENDING'
  ) then
    raise exception 'O cartão possui parcelas pendentes e não pode ser arquivado.';
  end if;

  update public.personal_wallet_cards
     set status = 'CANCELED'
   where id = p_card_id and owner_user_id = v_user;

  return jsonb_build_object('archived', true, 'id', p_card_id, 'request_id', p_request_id);
end;
$$;

revoke all on function public.personal_wallet_archive_account(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_archive_account(uuid, uuid) to authenticated;
revoke all on function public.personal_wallet_archive_card(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_archive_card(uuid, uuid) to authenticated;

-- Reafirma os grants das RPCs de exclusão e força atualização do cache do PostgREST.
revoke all on function public.personal_wallet_delete_account(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_delete_account(uuid, uuid) to authenticated;
revoke all on function public.personal_wallet_delete_card(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_delete_card(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
