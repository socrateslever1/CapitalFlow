-- Permite registrar posições REAIS acima do limite sem interpretar o excesso como limite disponível.
-- Substitui somente validações da carga inicial: mantém idempotência, RLS/autorização,
-- fatura de abertura, bloqueios de pagamento e recálculo canônico intactos.
-- Não concede crédito nem permite compras posteriores acima do limite.
begin;

create or replace function public.personal_wallet_set_card_initial_balances(
  p_card_id uuid,
  p_credit_limit numeric,
  p_current_invoice numeric,
  p_future_commitments numeric,
  p_due_month date,
  p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid(); v_card public.personal_wallet_cards%rowtype;
  v_month date := date_trunc('month', coalesce(p_due_month, current_date))::date;
  v_limit numeric(14,2); v_invoice numeric(14,2); v_future numeric(14,2);
  v_payload jsonb; v_override uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado a Carteira.'; end if;
  if p_card_id is null or p_request_id is null then raise exception 'Cartao e chave de requisicao sao obrigatorios.'; end if;
  if p_credit_limit is null or p_credit_limit < 0 or p_credit_limit <> round(p_credit_limit, 2) then raise exception 'Limite total invalido.'; end if;
  if p_current_invoice is null or p_current_invoice < 0 or p_current_invoice <> round(p_current_invoice, 2) then raise exception 'Fatura atual invalida.'; end if;
  if p_future_commitments is null or p_future_commitments < 0 or p_future_commitments <> round(p_future_commitments, 2) then raise exception 'Compromissos futuros invalidos.'; end if;
  v_limit := round(p_credit_limit, 2); v_invoice := round(p_current_invoice, 2); v_future := round(p_future_commitments, 2);
  -- Aberturas podem refletir excesso real de limite; não cria autorização para novos gastos.
  v_payload := jsonb_build_object('credit_limit', v_limit, 'current_invoice', v_invoice, 'future_commitments', v_future, 'due_month', v_month);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':card-initial-balances:' || p_card_id::text, 0));
  select * into v_card from public.personal_wallet_cards where id = p_card_id and owner_user_id = v_user and status = 'ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado ou acesso nao autorizado.'; end if;
  if v_card.initial_balance_requests ? p_request_id::text then
    if v_card.initial_balance_requests -> p_request_id::text <> v_payload then raise exception 'Chave reutilizada com parametros diferentes.'; end if;
    return private.wallet_recalculate_card_position(v_user, p_card_id, v_month) || jsonb_build_object('replayed', true);
  end if;
  update public.personal_wallet_cards
  set credit_limit = v_limit,
      initial_future_installments_balance = v_future,
      initial_balance_occurred_at = coalesce(initial_balance_occurred_at, now()),
      initial_balance_requests = initial_balance_requests || jsonb_build_object(p_request_id::text, v_payload),
      updated_at = now()
  where id = p_card_id and owner_user_id = v_user;
  if v_invoice > 0 then
    v_override := md5('card_initial_invoice:' || p_request_id::text)::uuid;
    perform public.personal_wallet_set_monthly_invoice_override(p_card_id, v_month, v_invoice, v_override);
  end if;
  return private.wallet_recalculate_card_position(v_user, p_card_id, v_month) || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.personal_wallet_set_card_opening_summary(
 p_card_id uuid, p_credit_limit numeric, p_used_limit numeric, p_invoice_amount numeric,
 p_cycle_month date, p_invoice_state text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_owner uuid:=auth.uid(); v_card public.personal_wallet_cards%rowtype;
 v_month date:=date_trunc('month',p_cycle_month)::date; v_native numeric; v_other numeric;
 v_payload jsonb; v_result jsonb; v_invoice_id uuid;
begin
 if v_owner is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
 if p_card_id is null or p_request_id is null or p_cycle_month is null or p_invoice_state is null or p_invoice_state not in ('OPEN','CLOSED') then raise exception 'Informe cartao, mes e situacao da fatura.'; end if;
 if p_credit_limit is null or p_used_limit is null or p_invoice_amount is null
 or p_credit_limit::text in ('NaN','Infinity','-Infinity') or p_used_limit::text in ('NaN','Infinity','-Infinity') or p_invoice_amount::text in ('NaN','Infinity','-Infinity')
 or p_credit_limit<0 or p_used_limit<0 or p_invoice_amount<0
 or p_invoice_amount>p_used_limit
 or p_credit_limit<>round(p_credit_limit,2) or p_used_limit<>round(p_used_limit,2) or p_invoice_amount<>round(p_invoice_amount,2)
 then raise exception 'Confira limite total, limite usado e fatura atual.'; end if;
 select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner and status='ACTIVE' for update;
 if not found then raise exception 'Cartao nao encontrado.'; end if;
 v_payload:=jsonb_build_object('limit',p_credit_limit,'used',p_used_limit,'invoice',p_invoice_amount,'month',v_month,'state',p_invoice_state);
 if v_card.opening_summary_requests ? p_request_id::text then
  if v_card.opening_summary_requests->p_request_id::text<>v_payload then raise exception 'Requisicao reutilizada com valores diferentes.'; end if;
  return jsonb_build_object('replayed',true);
 end if;
 -- Não move silenciosamente uma fatura consolidada anterior para outro ciclo.
 if exists(select 1 from public.personal_wallet_expenses where card_id=p_card_id and owner_user_id=v_owner and entry_type='INVOICE_OVERRIDE' and status<>'CANCELED' and invoice_due_month<>v_month)
 then raise exception 'Existe uma fatura consolidada em outro mes. Confira o ciclo antes de substituir a situacao inicial.'; end if;
 select coalesce(sum(private.wallet_effective_cycle_amount(v_owner,p_card_id,m.due_month)),0) into v_native
 from (select distinct i.due_month from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id
 where e.owner_user_id=v_owner and e.card_id=p_card_id and e.status<>'CANCELED' and i.status<>'CANCELED' and i.due_month>v_month) m;
 v_other:=round(p_used_limit-p_invoice_amount-v_native,2);
 if v_other<0 then raise exception 'O limite usado deve incluir a fatura e os gastos futuros cadastrados.'; end if;
 if p_invoice_amount=0 and exists(select 1 from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id where e.card_id=p_card_id and e.owner_user_id=v_owner and e.status<>'CANCELED' and i.status='PENDING' and i.due_month=v_month and i.amount>coalesce(i.paid_amount,0))
 then raise exception 'Este ciclo possui valores registrados. Revise o extrato antes de informar fatura zero.'; end if;
 v_result:=public.personal_wallet_set_card_initial_balances(p_card_id,p_credit_limit,p_invoice_amount,v_other,v_month,p_request_id);
 select id into v_invoice_id from public.personal_wallet_expenses where owner_user_id=v_owner and card_id=p_card_id and entry_type='INVOICE_OVERRIDE' and invoice_due_month=v_month and status<>'CANCELED';
 if v_invoice_id is not null then
  update public.personal_wallet_expenses set is_opening_summary=true,description='Fatura inicial informada' where id=v_invoice_id;
  update public.personal_wallet_expense_installments i set opening_invoice_id=v_invoice_id
  from public.personal_wallet_expenses e where i.expense_id=e.id and e.card_id=p_card_id and e.owner_user_id=v_owner and e.entry_type='PURCHASE' and e.status<>'CANCELED' and i.due_month=v_month;
 end if;
 update public.personal_wallet_cards set opening_invoice_month=v_month,opening_invoice_state=p_invoice_state,
 opening_summary_requests=opening_summary_requests||jsonb_build_object(p_request_id::text,v_payload)
 where id=p_card_id and owner_user_id=v_owner;
 return private.wallet_recalculate_card_position(v_owner,p_card_id,v_month);
end $$;
revoke all on function public.personal_wallet_set_card_opening_summary(uuid,numeric,numeric,numeric,date,text,uuid) from public,anon;
grant execute on function public.personal_wallet_set_card_opening_summary(uuid,numeric,numeric,numeric,date,text,uuid) to authenticated;

create or replace function private.wallet_effective_cycle_amount(p_owner_id uuid,p_card_id uuid,p_due_month date)
returns numeric language sql stable security definer set search_path=public,pg_temp as $$
 with invoice as (
 select id,is_opening_summary from public.personal_wallet_expenses
 where owner_user_id=p_owner_id and card_id=p_card_id and entry_type='INVOICE_OVERRIDE' and status<>'CANCELED'
 and invoice_due_month=date_trunc('month',p_due_month)::date limit 1
 )
 select coalesce(round(sum(greatest(0,i.amount-coalesce(i.paid_amount,0))),2),0)
 from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id
 where e.owner_user_id=p_owner_id and e.card_id=p_card_id and e.status<>'CANCELED' and i.status<>'CANCELED'
 and i.due_month=date_trunc('month',p_due_month)::date and (
 e.id=(select id from invoice) or
 (e.entry_type='PURCHASE' and i.status='PENDING' and
 (not exists(select 1 from invoice) or (exists(select 1 from invoice where is_opening_summary) and i.opening_invoice_id is distinct from (select id from invoice))))
 );
$$;

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
  if v_invoice < 0 or v_future < 0 then raise exception 'A carga inicial não pode conter valores negativos.'; end if;
  v_created := public.personal_wallet_create_linked_assets(null::jsonb,p_card,p_existing_account_id);
  v_card_id := (v_created->>'card_id')::uuid;
  update public.personal_wallet_cards set opening_request_id=p_request_id where id=v_card_id and owner_user_id=v_user;
  perform public.personal_wallet_set_card_opening_summary(v_card_id,v_limit,v_invoice+v_future,v_invoice,coalesce((p_opening->>'invoice_month')::date,date_trunc('month',current_date)::date),coalesce(p_opening->>'invoice_state','OPEN'),p_request_id);
  return v_created||jsonb_build_object('replayed',false);
end;
$$;

create or replace function public.personal_wallet_update_card_metadata(
  p_card_id uuid,p_nickname text,p_issuer text,p_brand text,p_account_id uuid,
  p_limit numeric,p_closing_day integer,p_due_day integer,p_status text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid := auth.uid(); v_card public.personal_wallet_cards%rowtype;
begin
 if v_owner is null or not public.is_platform_super_admin() then raise exception 'Sem permissão.'; end if;
 if p_card_id is null then raise exception 'Cartão não informado.'; end if;
 if char_length(trim(coalesce(p_nickname,''))) not between 1 and 120
    or char_length(trim(coalesce(p_issuer,''))) not between 1 and 120 then raise exception 'Identificação inválida.'; end if;
 if p_brand is not null and char_length(p_brand)>80 then raise exception 'Bandeira inválida.'; end if;
 if p_limit is null or p_limit < 0 or p_limit <> round(p_limit,2) then raise exception 'Limite inválido.'; end if;
 if p_closing_day is not null and p_closing_day not between 1 and 31 then raise exception 'Fechamento inválido.'; end if;
 if p_due_day is not null and p_due_day not between 1 and 31 then raise exception 'Vencimento inválido.'; end if;
 if p_status not in ('ACTIVE','BLOCKED','CANCELED') then raise exception 'Status inválido.'; end if;
 select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner for update;
 if not found then raise exception 'Cartão não encontrado.'; end if;
 if p_account_id is not null and not exists (
    select 1 from public.personal_wallet_accounts where id=p_account_id and owner_user_id=v_owner
 ) then raise exception 'Conta vinculada não autorizada.'; end if;
 if p_limit < greatest(v_card.used_limit,v_card.current_bill)
    and p_limit < v_card.credit_limit then
    raise exception 'Não reduza o limite de um cartão já excedido; mantenha ou aumente o limite declarado.'; end if;
 if p_status='CANCELED' and
    (v_card.used_limit>0 or v_card.current_bill>0 or exists (
      select 1 from public.personal_wallet_expenses e where e.card_id=p_card_id and e.status='PENDING'
    )) then raise exception 'Quite as obrigações pendentes antes de arquivar.'; end if;
 update public.personal_wallet_cards
   set nickname=trim(p_nickname),issuer=trim(p_issuer),brand=nullif(trim(coalesce(p_brand,'')),''),
     account_id=p_account_id,credit_limit=p_limit,closing_day=p_closing_day,
     due_day=p_due_day,status=p_status,updated_at=now()
 where id=p_card_id and owner_user_id=v_owner;
end;
$$;

-- Privilegios explicitos mantidos em todas as assinaturas substituídas.
revoke all on function public.personal_wallet_set_card_initial_balances(uuid,numeric,numeric,numeric,date,uuid) from public,anon;
grant execute on function public.personal_wallet_set_card_initial_balances(uuid,numeric,numeric,numeric,date,uuid) to authenticated;
revoke all on function public.personal_wallet_set_card_opening_summary(uuid,numeric,numeric,numeric,date,text,uuid) from public,anon;
grant execute on function public.personal_wallet_set_card_opening_summary(uuid,numeric,numeric,numeric,date,text,uuid) to authenticated;
revoke all on function public.personal_wallet_create_card_with_opening(jsonb,uuid,jsonb,uuid) from public,anon;
grant execute on function public.personal_wallet_create_card_with_opening(jsonb,uuid,jsonb,uuid) to authenticated;
revoke all on function public.personal_wallet_update_card_metadata(uuid,text,text,text,uuid,numeric,integer,integer,text) from public,anon;
grant execute on function public.personal_wallet_update_card_metadata(uuid,text,text,text,uuid,numeric,integer,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
