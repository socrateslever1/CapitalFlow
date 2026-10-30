-- Confirmed bank observations AND (only for a card with no financial history)
-- its opening financial position: one transaction, one authenticated request.
-- Reuses existing canonical opening RPC / ledger, never posts extracted purchases.
create or replace function public.personal_wallet_confirm_issuer_invoice(
  p_card_id uuid, p_due_month date, p_facts jsonb, p_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_card public.personal_wallet_cards%rowtype;
  v_month date := date_trunc('month', p_due_month)::date;
  v_due_date date;
  v_invoice numeric;
  v_minimum numeric;
  v_limit numeric;
  v_used numeric;
  v_available numeric;
  v_future numeric;
  v_issuer text;
  v_hash text;
  v_type text;
  v_state text;
  v_fact public.personal_wallet_card_invoice_facts%rowtype;
  v_applied boolean := false;
  v_replayed boolean := false;
  v_reason text := 'Dados bancários salvos. O cartão já possui histórico financeiro; a fatura não foi lançada novamente.';
  v_prior jsonb;
begin
  if v_owner is null or not public.is_platform_super_admin()
    or not exists (
      select 1 from public.user_modulos m
      where m.user_id = v_owner and m.modulo_chave = 'carteira' and m.ativo
    )
  then raise exception 'Acesso não autorizado à Carteira.'; end if;

  if p_card_id is null or p_due_month is null or p_request_id is null
    or p_facts is null or jsonb_typeof(p_facts) <> 'object'
    or p_due_month <> date_trunc('month', p_due_month)::date
  then raise exception 'Informe cartão, mês e dados bancários válidos.'; end if;

  v_due_date := nullif(p_facts->>'due_date','')::date;
  v_invoice := (p_facts->>'invoice_total')::numeric;
  v_minimum := (p_facts->>'minimum_payment')::numeric;
  v_limit := (p_facts->>'credit_limit')::numeric;
  v_used := (p_facts->>'used_limit')::numeric;
  v_available := (p_facts->>'available_limit')::numeric;
  v_future := (p_facts->>'future_installments')::numeric;
  v_issuer := nullif(trim(p_facts->>'issuer'),'');
  v_hash := p_facts->>'source_hash';
  v_type := coalesce(nullif(p_facts->>'source_type',''), 'MANUAL');

  if v_due_date is not null and date_trunc('month',v_due_date)::date <> v_month
  then raise exception 'Vencimento fora do mês escolhido.'; end if;
  if length(coalesce(v_issuer,'')) > 80 or v_type not in ('PDF','OFX','MANUAL')
    or (v_hash is not null and v_hash !~ '^[a-f0-9]{64}$')
  then raise exception 'Origem ou identificação bancária inválida.'; end if;
  if not (
    (v_invoice is null or (v_invoice between 0 and 9999999999.99 and v_invoice=round(v_invoice,2))) and
    (v_minimum is null or (v_minimum between 0 and 9999999999.99 and v_minimum=round(v_minimum,2))) and
    (v_limit is null or (v_limit between 0 and 9999999999.99 and v_limit=round(v_limit,2))) and
    (v_used is null or (v_used between 0 and 9999999999.99 and v_used=round(v_used,2))) and
    (v_available is null or (v_available between 0 and 9999999999.99 and v_available=round(v_available,2))) and
    (v_future is null or (v_future between 0 and 9999999999.99 and v_future=round(v_future,2)))
  ) then raise exception 'Valores monetários inválidos.'; end if;
  if v_invoice is not null and v_minimum is not null and v_minimum>v_invoice
  then raise exception 'Pagamento mínimo superior ao valor da fatura.'; end if;

  -- Serializes against opening balance RPCs and guards against a concurrent
  -- import/payment creating a second liability.
  perform pg_advisory_xact_lock(hashtextextended(
    v_owner::text || ':card-initial-balances:' || p_card_id::text, 0
  ));
  select * into v_card from public.personal_wallet_cards
  where owner_user_id=v_owner and id=p_card_id and status='ACTIVE' for update;
  if not found then raise exception 'Cartão ativo não encontrado.'; end if;

  if v_card.opening_summary_requests ? p_request_id::text then
    v_prior := v_card.opening_summary_requests->p_request_id::text;
    if v_prior->>'month' <> v_month::text
       or (v_prior->>'limit')::numeric is distinct from v_limit
       or (v_prior->>'used')::numeric is distinct from v_used
       or (v_prior->>'invoice')::numeric is distinct from v_invoice
    then raise exception 'Identificador de confirmação reutilizado com dados diferentes.'; end if;
    v_applied := true;
    v_replayed := true;
    v_reason := 'Posição inicial já registrada anteriormente. Nenhum lançamento foi duplicado.';
  elsif v_invoice is not null and v_invoice > 0 and v_used is not null
    and v_limit is not null and v_used >= v_invoice and
    (v_future is null or abs(v_used-v_invoice-v_future) <= 0.01) and
    coalesce(v_card.used_limit,0)=0 and coalesce(v_card.current_bill,0)=0
    and coalesce(v_card.initial_future_installments_balance,0)=0
    and not exists (
      select 1 from public.personal_wallet_expenses e
      where e.owner_user_id=v_owner and e.card_id=p_card_id and e.status<>'CANCELED'
    )
    and not exists (
      select 1 from public.personal_wallet_invoice_payments ip
      where ip.owner_user_id=v_owner and ip.card_id=p_card_id
    )
  then
    v_state := case when v_month < date_trunc('month',current_date)::date
      then 'CLOSED' else 'OPEN' end;
    perform public.personal_wallet_set_card_opening_summary(
      p_card_id,v_limit,v_used,v_invoice,v_month,v_state,p_request_id
    );
    v_applied := true;
    v_reason := 'Fatura e limite utilizado registrados na posição financeira inicial do cartão.';
  elsif v_invoice is null or v_used is null or v_limit is null then
    v_reason := 'Dados bancários salvos. Informe fatura, limite total e limite utilizado para preencher a posição inicial.';
  elsif v_used < v_invoice or
    (v_future is not null and abs(v_used-v_invoice-v_future)>0.01) then
    v_reason := 'Dados bancários salvos, mas os valores não fecham; confira fatura, limite usado e parcelas futuras antes de aplicar.';
  end if;

  insert into public.personal_wallet_card_invoice_facts(
    owner_user_id,card_id,due_month,due_date,issuer,invoice_total,
    minimum_payment,credit_limit,used_limit,available_limit,
    future_installments,source_hash,source_type,updated_at
  ) values (
    v_owner,p_card_id,v_month,v_due_date,v_issuer,v_invoice,
    v_minimum,v_limit,v_used,v_available,v_future,v_hash,v_type,now()
  )
  on conflict(owner_user_id,card_id,due_month)
  do update set due_date=excluded.due_date,issuer=excluded.issuer,
    invoice_total=excluded.invoice_total, minimum_payment=excluded.minimum_payment,
    credit_limit=excluded.credit_limit, used_limit=excluded.used_limit,
    available_limit=excluded.available_limit,future_installments=excluded.future_installments,
    source_hash=excluded.source_hash,source_type=excluded.source_type,updated_at=now()
  returning * into v_fact;

  return jsonb_build_object('facts',to_jsonb(v_fact),
    'due_month',v_month,'financial_applied',v_applied,
    'replayed',v_replayed,'note',v_reason);
end;
$$;
revoke all on function public.personal_wallet_confirm_issuer_invoice(uuid,date,jsonb,uuid)
  from public,anon;
grant execute on function public.personal_wallet_confirm_issuer_invoice(uuid,date,jsonb,uuid)
  to authenticated;
notify pgrst, 'reload schema';
