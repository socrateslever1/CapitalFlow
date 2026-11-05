-- Creates a card and its newly requested bank account in one transaction.
-- The account starts at zero; the canonical opening RPC is called by the client
-- only after this transaction returns, preserving the ledger boundary.
create or replace function public.personal_wallet_create_complete_card_with_new_account(
  p_account jsonb,
  p_card jsonb,
  p_opening jsonb,
  p_request_id uuid,
  p_identity jsonb,
  p_envelope jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_account_id uuid;
  v_result jsonb;
  v_prior public.personal_wallet_cards%rowtype;
  v_nickname text;
  v_bank text;
  v_type text;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso não autorizado ao cadastro vinculado.';
  end if;
  if p_account is null or jsonb_typeof(p_account) <> 'object' then
    raise exception 'Dados da nova conta são obrigatórios.';
  end if;
  if p_request_id is null then raise exception 'Identificador da solicitação é obrigatório.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':wallet-linked-card-account:'||p_request_id::text, 0));
  select * into v_prior from public.personal_wallet_cards
    where owner_user_id=v_user and opening_request_id=p_request_id for update;
  if found then
    return jsonb_build_object('account_id', v_prior.account_id, 'card_id', v_prior.id, 'replayed', true, 'account_created', true);
  end if;

  v_nickname := btrim(coalesce(p_account->>'nickname',''));
  v_bank := btrim(coalesce(p_account->>'bank_name',''));
  v_type := coalesce(nullif(p_account->>'account_type',''), 'CHECKING');
  if char_length(v_nickname) not between 1 and 120 or char_length(v_bank) not between 1 and 120 then
    raise exception 'Nome e instituição da conta são obrigatórios.';
  end if;
  if v_type not in ('CHECKING','PAYMENT','SAVINGS','CASH','INVESTMENT') then
    raise exception 'Tipo da conta inválido.';
  end if;

  insert into public.personal_wallet_accounts(owner_user_id,nickname,bank_name,account_type,balance,pix_key,pix_key_type,notes,institution_key,bank_details)
  values(v_user,v_nickname,v_bank,v_type,0,null,null,null,
    coalesce(public.personal_wallet_canonical_institution(v_bank), lower(regexp_replace(v_bank,'[^a-zA-Z0-9]','','g'))),
    coalesce(p_account->'bank_details','{}'::jsonb))
  returning id into v_account_id;

  v_result := public.personal_wallet_create_complete_card(p_card,v_account_id,p_opening,p_request_id,p_identity,p_envelope);
  return v_result || jsonb_build_object('account_created', true);
end;
$$;
revoke all on function public.personal_wallet_create_complete_card_with_new_account(jsonb,jsonb,jsonb,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.personal_wallet_create_complete_card_with_new_account(jsonb,jsonb,jsonb,uuid,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
