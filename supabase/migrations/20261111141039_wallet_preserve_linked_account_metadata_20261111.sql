-- Preserva todos os detalhes da conta durante criação e vinculação atômica de cartão.
-- Não altera contas preexistentes e mantém as validações atuais de autorização.
CREATE OR REPLACE FUNCTION public.personal_wallet_create_account_with_existing_card(p_account jsonb, p_card_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_account_id uuid;
  v_card public.personal_wallet_cards%rowtype;
  v_nickname text;
  v_bank text;
  v_type text;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso não autorizado.'; end if;
  if p_account is null or jsonb_typeof(p_account) <> 'object' or p_card_id is null then raise exception 'Conta e cartão são obrigatórios.'; end if;
  select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_user for update;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  if v_card.account_id is not null then raise exception 'Este cartão já está vinculado a uma conta.'; end if;
  v_nickname := btrim(coalesce(p_account->>'nickname',''));
  v_bank := btrim(coalesce(p_account->>'bank_name',''));
  v_type := coalesce(nullif(p_account->>'account_type',''), 'CHECKING');
  if char_length(v_nickname) not between 1 and 120 or char_length(v_bank) not between 1 and 120 then raise exception 'Nome e instituição da conta são obrigatórios.'; end if;
  if char_length(coalesce(p_account->>'pix_key',''))>255
      or char_length(coalesce(p_account->>'pix_key_type',''))>40
      or char_length(coalesce(p_account->>'notes',''))>2000
      or (p_account ? 'bank_details' and jsonb_typeof(p_account->'bank_details')<>'object') then
    raise exception 'Campos opcionais da conta inválidos.';
  end if;
  if v_type not in ('CHECKING','PAYMENT','SAVINGS','CASH','INVESTMENT') then raise exception 'Tipo da conta inválido.'; end if;
  insert into public.personal_wallet_accounts(owner_user_id,nickname,bank_name,account_type,balance,pix_key,pix_key_type,notes,institution_key,bank_details)
  values(v_user,v_nickname,v_bank,v_type,0,
    nullif(btrim(p_account->>'pix_key'),''),
    nullif(btrim(p_account->>'pix_key_type'),''),
    nullif(btrim(p_account->>'notes'),''),
    coalesce(public.personal_wallet_canonical_institution(v_bank), lower(regexp_replace(v_bank,'[^a-zA-Z0-9]','','g'))),
    coalesce(p_account->'bank_details','{}'::jsonb))
  returning id into v_account_id;
  update public.personal_wallet_cards set account_id=v_account_id, updated_at=now() where id=p_card_id and owner_user_id=v_user;
  return jsonb_build_object('account_id',v_account_id,'card_id',p_card_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.personal_wallet_create_complete_card_with_new_account(p_account jsonb, p_card jsonb, p_opening jsonb, p_request_id uuid, p_identity jsonb, p_envelope jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if char_length(coalesce(p_account->>'pix_key',''))>255
      or char_length(coalesce(p_account->>'pix_key_type',''))>40
      or char_length(coalesce(p_account->>'notes',''))>2000
      or (p_account ? 'bank_details' and jsonb_typeof(p_account->'bank_details')<>'object') then
    raise exception 'Campos opcionais da conta inválidos.';
  end if;
  if v_type not in ('CHECKING','PAYMENT','SAVINGS','CASH','INVESTMENT') then
    raise exception 'Tipo da conta inválido.';
  end if;

  insert into public.personal_wallet_accounts(owner_user_id,nickname,bank_name,account_type,balance,pix_key,pix_key_type,notes,institution_key,bank_details)
  values(v_user,v_nickname,v_bank,v_type,0,
    nullif(btrim(p_account->>'pix_key'),''),
    nullif(btrim(p_account->>'pix_key_type'),''),
    nullif(btrim(p_account->>'notes'),''),
    coalesce(public.personal_wallet_canonical_institution(v_bank), lower(regexp_replace(v_bank,'[^a-zA-Z0-9]','','g'))),
    coalesce(p_account->'bank_details','{}'::jsonb))
  returning id into v_account_id;

  v_result := public.personal_wallet_create_complete_card(p_card,v_account_id,p_opening,p_request_id,p_identity,p_envelope);
  return v_result || jsonb_build_object('account_created', true);
end;
$function$
;
