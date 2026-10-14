-- Redução auditável do capital na modalidade Diária Livre.
-- Mantém o principal original, reconcilia parcela e fonte e registra ledger.
-- A operação não representa recebimento do cliente.

create or replace function public.process_daily_free_principal_correction_v1(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_profile_id uuid,
  p_target_principal numeric,
  p_operator_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_profile_id uuid; v_source_id uuid; v_cycle text; v_status text; v_agreement_id uuid;
  v_current_principal numeric; v_original_principal numeric; v_total_before numeric;
  v_target numeric := round(coalesce(p_target_principal,0)::numeric,2); v_reduction numeric;
  v_source_before numeric; v_source_after numeric; v_inst_id uuid; v_inst_count integer;
  v_principal_before numeric; v_scheduled_before numeric; v_amount_before numeric; v_value_before numeric;
  v_interest_before numeric; v_late_before numeric; v_paid_principal numeric;
  v_tx_id uuid := gen_random_uuid(); v_existing public.transacoes%rowtype; v_operator_id uuid;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_result jsonb;
begin
  if p_idempotency_key is null then raise exception 'Chave de idempotencia obrigatoria.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));

  select coalesce(c.profile_id,c.owner_id),c.source_id,upper(coalesce(c.billing_cycle,'')),
         upper(coalesce(c.status,'')),c.acordo_ativo_id,coalesce(c.principal,0),
         coalesce(c.original_principal,c.principal,0),coalesce(c.total_to_receive,c.principal,0)
    into v_profile_id,v_source_id,v_cycle,v_status,v_agreement_id,v_current_principal,v_original_principal,v_total_before
    from public.contratos c where c.id=p_loan_id for update;

  if not found then raise exception 'Contrato nao encontrado.'; end if;
  if p_profile_id is distinct from v_profile_id then raise exception 'Perfil informado nao corresponde ao contrato.'; end if;
  if not private.financial_actor_can_access(v_profile_id) then raise exception 'Usuario sem permissao para ajustar este contrato.'; end if;
  if v_cycle <> 'DAILY_FREE' then raise exception 'A reducao livre de capital por edicao esta disponivel apenas na Diaria Livre.'; end if;
  if v_agreement_id is not null or v_status in ('EM_ACORDO','IN_AGREEMENT','RENEGOCIADO') then raise exception 'Contrato com acordo ativo deve ser ajustado pelo fluxo de renegociacao.'; end if;
  if v_target <= 0 then raise exception 'O capital deve permanecer maior que zero.'; end if;
  if v_target >= round(v_current_principal,2)-0.005 then raise exception 'Informe um capital menor que o atual para esta correcao.'; end if;

  select * into v_existing from public.transacoes
   where profile_id=v_profile_id and idempotency_key=p_idempotency_key::text
   order by created_at desc nulls last,id desc limit 1;
  if found then
    if v_existing.loan_id is distinct from p_loan_id or upper(coalesce(v_existing.type,'')) <> 'PRINCIPAL_CORRECTION_REDUCTION'
      then raise exception 'Chave de idempotencia ja utilizada por outra operacao.'; end if;
    return coalesce(v_existing.meta->'result','{}'::jsonb)||jsonb_build_object('success',true,'idempotent_replay',true);
  end if;

  select count(*)::integer,min(id) into v_inst_count,v_inst_id
    from public.parcelas
   where loan_id=p_loan_id
     and upper(coalesce(status,'')) not in ('PAID','PAGO','QUITADO','QUITADA','FINALIZADO','CANCELADO','RENEGOCIADO')
     and coalesce(principal_remaining,0)+coalesce(interest_remaining,0)+coalesce(late_fee_accrued,0)>0.005;
  if v_inst_count<>1 or v_inst_id is null then raise exception 'A Diaria Livre precisa ter uma unica parcela aberta para reduzir o capital com seguranca.'; end if;

  select coalesce(principal_remaining,0),coalesce(scheduled_principal,0),coalesce(amount,0),coalesce(valor_parcela,0),
         coalesce(interest_remaining,0),coalesce(late_fee_accrued,0),coalesce(paid_principal,0)
    into v_principal_before,v_scheduled_before,v_amount_before,v_value_before,v_interest_before,v_late_before,v_paid_principal
    from public.parcelas where id=v_inst_id and loan_id=p_loan_id for update;

  v_reduction:=round(v_current_principal-v_target,2);
  if v_reduction>v_principal_before+0.005 then raise exception 'O capital informado ficaria abaixo do principal ja recuperado. Use o fluxo de recebimento para valores pagos.'; end if;
  if v_source_id is null then raise exception 'Contrato sem fonte de capital vinculada.'; end if;

  select balance into v_source_before from public.fontes
   where id=v_source_id and profile_id=v_profile_id and archived_at is null for update;
  if not found then raise exception 'Fonte de capital do contrato nao encontrada.'; end if;

  v_operator_id:=case when v_is_service then p_operator_id else private.financial_actor_profile_id() end;

  update public.fontes set balance=round(coalesce(balance,0)+v_reduction,2) where id=v_source_id;
  update public.contratos
     set principal=v_target,total_to_receive=greatest(0,round(v_total_before-v_reduction,2)),original_principal=v_original_principal
   where id=p_loan_id;
  update public.parcelas
     set principal_remaining=greatest(0,round(v_principal_before-v_reduction,2)),
         scheduled_principal=greatest(0,round(v_scheduled_before-v_reduction,2)),
         amount=greatest(0,round(v_amount_before-v_reduction,2)),
         valor_parcela=greatest(0,round(v_value_before-v_reduction,2)),
         logs=coalesce(logs,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
           'at',now(),'type','PRINCIPAL_CORRECTION_REDUCTION','amount',v_reduction,
           'principal_before',v_current_principal,'principal_after',v_target,'operator_id',v_operator_id))
   where id=v_inst_id;

  select balance into v_source_after from public.fontes where id=v_source_id;
  v_result:=jsonb_build_object(
    'success',true,'transaction_id',v_tx_id,'idempotency_key',p_idempotency_key,'amount_reduced',v_reduction,
    'contract_principal_before',round(v_current_principal,2),'contract_principal_after',v_target,
    'installment_principal_before',round(v_principal_before,2),
    'installment_principal_after',greatest(0,round(v_principal_before-v_reduction,2)),
    'source_balance_before',v_source_before,'source_balance_after',v_source_after,'idempotent_replay',false);

  insert into public.transacoes(
    id,profile_id,loan_id,installment_id,source_id,date,type,amount,principal_delta,interest_delta,late_fee_delta,
    notes,category,idempotency_key,operator_id,payment_type,meta)
  values(
    v_tx_id,v_profile_id,p_loan_id,v_inst_id,v_source_id,now(),'PRINCIPAL_CORRECTION_REDUCTION',0,-v_reduction,0,0,
    coalesce(nullif(trim(p_reason),''),'Reducao de capital pela edicao da Diaria Livre'),'CORRECAO',
    p_idempotency_key::text,v_operator_id,'CORRECAO',
    jsonb_build_object(
      'engine','PRINCIPAL_CORRECTION_V1',
      'before',jsonb_build_object(
        'source_balance',v_source_before,'contract_principal',v_current_principal,'contract_total_to_receive',v_total_before,
        'installment_principal',v_principal_before,'installment_scheduled_principal',v_scheduled_before,
        'installment_amount',v_amount_before,'installment_value',v_value_before,'interest_remaining',v_interest_before,
        'late_fee_accrued',v_late_before,'paid_principal',v_paid_principal),
      'after',jsonb_build_object(
        'source_balance',v_source_after,'contract_principal',v_target,
        'contract_total_to_receive',greatest(0,round(v_total_before-v_reduction,2)),
        'installment_principal',greatest(0,round(v_principal_before-v_reduction,2)),
        'installment_scheduled_principal',greatest(0,round(v_scheduled_before-v_reduction,2)),
        'installment_amount',greatest(0,round(v_amount_before-v_reduction,2)),
        'installment_value',greatest(0,round(v_value_before-v_reduction,2))),
      'result',v_result));
  return v_result;
end;
$$;

revoke all on function public.process_daily_free_principal_correction_v1(uuid,uuid,uuid,numeric,uuid,text) from public,anon;
grant execute on function public.process_daily_free_principal_correction_v1(uuid,uuid,uuid,numeric,uuid,text) to authenticated,service_role;

create or replace function public.reverse_daily_free_principal_correction_v1(
  p_original_idempotency_key uuid,p_reversal_idempotency_key uuid,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public,private,extensions,pg_temp
as $$
declare
  v_original public.transacoes%rowtype; v_existing public.transacoes%rowtype;
  v_before jsonb; v_after jsonb; v_reduction numeric; v_result jsonb; v_reversal_id uuid:=gen_random_uuid();
  v_contract_principal numeric; v_contract_total numeric; v_inst_principal numeric; v_inst_scheduled numeric;
  v_inst_amount numeric; v_inst_value numeric;
begin
  if p_original_idempotency_key is null or p_reversal_idempotency_key is null then raise exception 'Chaves da correcao e do estorno sao obrigatorias.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Motivo do estorno obrigatorio.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_original_idempotency_key::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_reversal_idempotency_key::text,0));

  select * into v_original from public.transacoes
   where idempotency_key=p_original_idempotency_key::text
     and upper(coalesce(type,''))='PRINCIPAL_CORRECTION_REDUCTION'
     and coalesce(meta->>'engine','')='PRINCIPAL_CORRECTION_V1'
   order by created_at desc nulls last,id desc limit 1 for update;
  if not found then raise exception 'Correcao de capital nao encontrada.'; end if;
  if not private.financial_actor_can_access(v_original.profile_id) then raise exception 'Usuario sem permissao para estornar esta correcao.'; end if;

  select * into v_existing from public.transacoes where profile_id=v_original.profile_id and idempotency_key=p_reversal_idempotency_key::text limit 1;
  if found then
    if v_existing.reversed_of_transaction_id is distinct from v_original.id or upper(coalesce(v_existing.type,''))<>'REVERSAL'
      then raise exception 'Chave de estorno ja utilizada por outra operacao.'; end if;
    return coalesce(v_existing.meta->'result','{}'::jsonb)||jsonb_build_object('success',true,'idempotent_replay',true);
  end if;

  if exists(select 1 from public.transacoes t where t.reversed_of_transaction_id=v_original.id or t.original_tx_id=v_original.id)
    then raise exception 'Correcao ja estornada.'; end if;
  if exists(select 1 from public.transacoes later
             where later.loan_id=v_original.loan_id
               and coalesce(later.created_at,later.date)>coalesce(v_original.created_at,v_original.date)
               and later.id<>v_original.id)
    then raise exception 'Existem operacoes posteriores no contrato. Estorno automatico bloqueado.'; end if;

  v_before:=v_original.meta->'before'; v_after:=v_original.meta->'after'; v_reduction:=abs(coalesce(v_original.principal_delta,0));
  perform 1 from public.fontes where id=v_original.source_id and profile_id=v_original.profile_id for update;
  if not found then raise exception 'Fonte da correcao nao encontrada.'; end if;

  select coalesce(principal,0),coalesce(total_to_receive,0) into v_contract_principal,v_contract_total
    from public.contratos where id=v_original.loan_id for update;
  select coalesce(principal_remaining,0),coalesce(scheduled_principal,0),coalesce(amount,0),coalesce(valor_parcela,0)
    into v_inst_principal,v_inst_scheduled,v_inst_amount,v_inst_value
    from public.parcelas where id=v_original.installment_id and loan_id=v_original.loan_id for update;

  if round(v_contract_principal,2)<>round((v_after->>'contract_principal')::numeric,2)
     or round(v_contract_total,2)<>round((v_after->>'contract_total_to_receive')::numeric,2)
     or round(v_inst_principal,2)<>round((v_after->>'installment_principal')::numeric,2)
     or round(v_inst_scheduled,2)<>round((v_after->>'installment_scheduled_principal')::numeric,2)
     or round(v_inst_amount,2)<>round((v_after->>'installment_amount')::numeric,2)
     or round(v_inst_value,2)<>round((v_after->>'installment_value')::numeric,2)
    then raise exception 'Estado financeiro divergiu do snapshot da correcao. Estorno automatico bloqueado.'; end if;

  update public.fontes set balance=round(coalesce(balance,0)-v_reduction,2) where id=v_original.source_id;
  update public.contratos set principal=(v_before->>'contract_principal')::numeric,total_to_receive=(v_before->>'contract_total_to_receive')::numeric
   where id=v_original.loan_id;
  update public.parcelas
     set principal_remaining=(v_before->>'installment_principal')::numeric,
         scheduled_principal=(v_before->>'installment_scheduled_principal')::numeric,
         amount=(v_before->>'installment_amount')::numeric,
         valor_parcela=(v_before->>'installment_value')::numeric
   where id=v_original.installment_id;

  v_result:=jsonb_build_object('success',true,'transaction_id',v_reversal_id,'original_transaction_id',v_original.id,
    'idempotency_key',p_reversal_idempotency_key,'amount_reversed',v_reduction,'idempotent_replay',false);

  insert into public.transacoes(
    id,profile_id,loan_id,installment_id,source_id,date,type,amount,principal_delta,interest_delta,late_fee_delta,
    notes,category,idempotency_key,operator_id,original_tx_id,reversed_of_transaction_id,payment_type,meta)
  values(
    v_reversal_id,v_original.profile_id,v_original.loan_id,v_original.installment_id,v_original.source_id,now(),
    'REVERSAL',0,v_reduction,0,0,trim(p_reason),'ESTORNO',p_reversal_idempotency_key::text,
    private.financial_actor_profile_id(),v_original.id,v_original.id,'CORRECAO',
    jsonb_build_object('engine','PRINCIPAL_CORRECTION_V1','reversal_of_idempotency_key',p_original_idempotency_key,
      'reason',trim(p_reason),'result',v_result));
  return v_result;
end;
$$;

revoke all on function public.reverse_daily_free_principal_correction_v1(uuid,uuid,text) from public,anon;
grant execute on function public.reverse_daily_free_principal_correction_v1(uuid,uuid,text) to authenticated,service_role;
notify pgrst,'reload schema';
