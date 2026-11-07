begin;

create or replace function public.personal_wallet_create_card_with_opening(
  p_card jsonb,
  p_existing_account_id uuid,
  p_opening jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid(); v_prior public.personal_wallet_cards%rowtype;
  v_created jsonb; v_card_id uuid; v_limit numeric; v_invoice numeric; v_future numeric;
begin
  if v_user is null or not public.is_platform_super_admin() or not exists (
    select 1 from public.user_modulos m where m.user_id=v_user and m.modulo_chave='carteira' and m.ativo
  ) then raise exception 'Acesso nao autorizado a Carteira.'; end if;
  if p_request_id is null or p_card is null or p_opening is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':wallet-card-opening:'||p_request_id::text,0));
  select * into v_prior from public.personal_wallet_cards where owner_user_id=v_user and opening_request_id=p_request_id for update;
  if found then
    if v_prior.nickname <> trim(coalesce(p_card->>'nickname','')) or v_prior.issuer <> trim(coalesce(p_card->>'issuer','')) or v_prior.credit_limit <> nullif(p_card->>'credit_limit','')::numeric or v_prior.account_id is distinct from p_existing_account_id then
      raise exception 'Identificador de cadastro reutilizado com dados diferentes.';
    end if;
    return jsonb_build_object('account_id',v_prior.account_id,'card_id',v_prior.id,'replayed',true);
  end if;
  v_limit := coalesce((p_card->>'credit_limit')::numeric,0);
  v_invoice := coalesce((p_opening->>'invoice_amount')::numeric,0);
  v_future := coalesce((p_opening->>'future_amount')::numeric,0);
  if v_invoice < 0 or v_future < 0 or round(v_invoice+v_future,2) > v_limit then raise exception 'A carga inicial excede o limite contratado.'; end if;
  v_created := public.personal_wallet_create_linked_assets(null::jsonb,p_card,p_existing_account_id);
  v_card_id := (v_created->>'card_id')::uuid;
  update public.personal_wallet_cards set opening_request_id=p_request_id where id=v_card_id and owner_user_id=v_user;
  perform public.personal_wallet_set_card_initial_balances(v_card_id,v_limit,v_invoice,v_future,coalesce((p_opening->>'invoice_month')::date,date_trunc('month',current_date)::date),p_request_id);
  return v_created||jsonb_build_object('replayed',false);
end;
$$;

revoke all on function public.personal_wallet_create_card_with_opening(jsonb,uuid,jsonb,uuid) from public, anon;
grant execute on function public.personal_wallet_create_card_with_opening(jsonb,uuid,jsonb,uuid) to authenticated;

commit;
