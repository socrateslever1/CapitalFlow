-- Compatible atomic card registration. Reuses the canonical idempotent opening
-- routine. CVC/PAN/PIN/password are never accepted or stored by this API.
create or replace function public.personal_wallet_create_complete_card(
  p_card jsonb,
  p_existing_account_id uuid,
  p_opening jsonb,
  p_request_id uuid,
  p_identity jsonb,
  p_envelope jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
  v_card_id uuid;
  v_name text;
  v_month integer;
  v_year integer;
  v_previous public.personal_wallet_cards%rowtype;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso não autorizado ao cadastro do cartão.';
  end if;
  if p_envelope is not null then
    raise exception 'Dados completos e CVC não são aceitos no cadastro. Informe apenas o final do cartão.';
  end if;
  if p_card is null or jsonb_typeof(p_card) <> 'object'
     or p_card ?| array['number','card_number','pan','cvc','cvv','securityCode','password','vault_password'] then
    raise exception 'Cadastro contém dados sensíveis proibidos.';
  end if;
  if p_identity is not null and jsonb_typeof(p_identity) <> 'object' then
    raise exception 'Dados de identificação inválidos.';
  end if;
  if p_identity ?| array['number','card_number','pan','cvc','cvv','securityCode','password'] then
    raise exception 'Dados de identificação contêm informação sensível proibida.';
  end if;
  v_name := nullif(upper(btrim(coalesce(p_identity->>'cardholder_name',''))),'');
  if v_name is not null and length(v_name)>120 then
    raise exception 'Nome do titular deve ter no máximo 120 caracteres.';
  end if;
  v_month := nullif(p_identity->>'expiry_month','')::integer;
  v_year := nullif(p_identity->>'expiry_year','')::integer;
  if (v_month is null) <> (v_year is null)
     or (v_month is not null and v_month not between 1 and 12)
     or (v_year is not null and v_year not between 2000 and 2200) then
    raise exception 'Mês e ano de validade devem ser informados juntos e válidos.';
  end if;

  -- The existing function locks by owner/request id, verifies module access,
  -- creates card/linked account atomically and records opening once.
  v_result := public.personal_wallet_create_card_with_opening(
    p_card, p_existing_account_id, p_opening, p_request_id
  );
  v_card_id := (v_result->>'card_id')::uuid;
  if v_card_id is null then
    raise exception 'Cadastro não retornou o cartão criado.';
  end if;

  select * into v_previous from public.personal_wallet_cards
  where id=v_card_id and owner_user_id=v_user for update;
  if not found then raise exception 'Cartão criado não está acessível ao titular.'; end if;

  if coalesce((v_result->>'replayed')::boolean,false) then
    if v_previous.cardholder_name is distinct from v_name
       or v_previous.expiry_month is distinct from v_month
       or v_previous.expiry_year is distinct from v_year
       or v_previous.last_four is distinct from nullif(p_card->>'last_four','')
       or v_previous.brand is distinct from nullif(p_card->>'brand','')
       or v_previous.closing_day is distinct from nullif(p_card->>'closing_day','')::smallint
       or v_previous.due_day is distinct from nullif(p_card->>'due_day','')::smallint then
      raise exception 'Cadastro repetido com dados divergentes. Atualize os dados do cartão existente.';
    end if;
  else
    update public.personal_wallet_cards
    set cardholder_name=v_name,
        expiry_month=v_month,
        expiry_year=v_year,
        updated_at=now()
    where id=v_card_id and owner_user_id=v_user;
  end if;
  return v_result;
end;
$$;
revoke all on function public.personal_wallet_create_complete_card(jsonb,uuid,jsonb,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.personal_wallet_create_complete_card(jsonb,uuid,jsonb,uuid,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
