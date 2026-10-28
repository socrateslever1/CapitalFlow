-- Arquivamento seguro de contas e cartões da Carteira.
-- O histórico financeiro é preservado; os ativos deixam de aparecer como ativos.
alter table public.personal_wallajuset_accounts
  add column if not exists archived_at timestamptz;

create index if not exists personal_wallet_accounts_active_idx
  on public.personal_wallet_accounts(owner_user_id, created_at desc)
  where archived_at is null;

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
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_account_id is null or p_request_id is null then
    raise exception 'Conta e identificador da solicitacao sao obrigatorios.';
  end if;

  select * into v_account
    from public.personal_wallet_accounts
   where id = p_account_id and owner_user_id = v_user
   for update;
  if not found then raise exception 'Conta nao encontrada.'; end if;
  if v_account.archived_at is not null then
    return jsonb_build_object('archived', true, 'id', v_account.id, 'replayed', true);
  end if;
  if coalesce(v_account.balance, 0) <> 0 then
    raise exception 'A conta precisa estar com saldo zero antes de ser arquivada.';
  end if;
  if exists (
    select 1 from public.personal_wallet_expenses e
     where e.owner_user_id = v_user and e.account_id = p_account_id
       and e.status <> 'CANCELED'
  ) then
    raise exception 'Cancele ou liquide os lancamentos ativos desta conta antes de arquivar.';
  end if;

  update public.personal_wallet_accounts
     set archived_at = now(), updated_at = now()
   where id = p_account_id and owner_user_id = v_user;
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
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_card_id is null or p_request_id is null then
    raise exception 'Cartao e identificador da solicitacao sao obrigatorios.';
  end if;
  select * into v_card
    from public.personal_wallet_cards
   where id = p_card_id and owner_user_id = v_user
   for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  if v_card.status = 'CANCELED' then
    return jsonb_build_object('archived', true, 'id', v_card.id, 'replayed', true);
  end if;
  if coalesce(v_card.used_limit, 0) <> 0 or coalesce(v_card.current_bill, 0) <> 0 then
    raise exception 'Quite a fatura e o limite utilizado antes de arquivar o cartao.';
  end if;
  if exists (
    select 1 from public.personal_wallet_expenses e
     where e.owner_user_id = v_user and e.card_id = p_card_id
       and e.status <> 'CANCELED'
  ) then
    raise exception 'Cancele ou liquide os lancamentos ativos deste cartao antes de arquivar.';
  end if;

  update public.personal_wallet_cards
     set status = 'CANCELED', updated_at = now()
   where id = p_card_id and owner_user_id = v_user;
  return jsonb_build_object('archived', true, 'id', p_card_id, 'request_id', p_request_id);
end;
$$;

revoke all on function public.personal_wallet_archive_account(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_archive_account(uuid, uuid) to authenticated;
revoke all on function public.personal_wallet_archive_card(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_archive_card(uuid, uuid) to authenticated;
