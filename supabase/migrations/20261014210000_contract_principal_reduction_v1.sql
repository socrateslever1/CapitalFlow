-- Migration: 20261014210000_contract_principal_reduction_v1.sql
-- Abatimento e redução auditável de capital para todas as modalidades na edição de contratos.
-- Retorna o capital abatido para a fonte, reconcilia parcelas e contratos, e registra no ledger (transações).

create or replace function public.process_contract_principal_reduction_v1(
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
  v_profile_id uuid;
  v_source_id uuid;
  v_cycle text;
  v_status text;
  v_agreement_id uuid;
  v_current_principal numeric;
  v_original_principal numeric;
  v_total_before numeric;
  v_target numeric := round(coalesce(p_target_principal, 0)::numeric, 2);
  v_reduction numeric;
  v_source_before numeric;
  v_source_after numeric;
  v_total_open_principal numeric := 0;
  v_reduction_rem numeric;
  v_tx_id uuid := gen_random_uuid();
  v_existing public.transacoes%rowtype;
  v_operator_id uuid;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_result jsonb;
  v_first_inst_id uuid;
  r record;
begin
  if p_idempotency_key is null then
    raise exception 'Chave de idempotência obrigatória.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select coalesce(c.profile_id, c.owner_id), c.source_id, upper(coalesce(c.billing_cycle, '')),
         upper(coalesce(c.status, '')), c.acordo_ativo_id, coalesce(c.principal, 0),
         coalesce(c.original_principal, c.principal, 0), coalesce(c.total_to_receive, c.principal, 0)
    into v_profile_id, v_source_id, v_cycle, v_status, v_agreement_id, v_current_principal, v_original_principal, v_total_before
    from public.contratos c
   where c.id = p_loan_id
   for update;

  if not found then
    raise exception 'Contrato não encontrado.';
  end if;

  if p_profile_id is distinct from v_profile_id then
    raise exception 'Perfil informado não corresponde ao contrato.';
  end if;

  if not private.financial_actor_can_access(v_profile_id) then
    raise exception 'Usuário sem permissão para ajustar este contrato.';
  end if;

  if v_agreement_id is not null or v_status in ('EM_ACORDO', 'IN_AGREEMENT', 'RENEGOCIADO') then
    raise exception 'Contrato com acordo ativo deve ser ajustado pelo fluxo de renegociação.';
  end if;

  if v_target <= 0 then
    raise exception 'O capital deve permanecer maior que zero.';
  end if;

  if v_target >= round(v_current_principal, 2) - 0.005 then
    raise exception 'Informe um capital menor que o atual para esta redução/abatimento.';
  end if;

  v_reduction := round(v_current_principal - v_target, 2);

  -- Idempotency check
  select * into v_existing
    from public.transacoes
   where profile_id = v_profile_id
     and idempotency_key = p_idempotency_key::text
   order by created_at desc nulls last, id desc
   limit 1;

  if found then
    if v_existing.loan_id is distinct from p_loan_id or upper(coalesce(v_existing.type, '')) <> 'PRINCIPAL_CORRECTION_REDUCTION' then
      raise exception 'Chave de idempotência já utilizada por outra operação.';
    end if;
    return coalesce(v_existing.meta -> 'result', '{}'::jsonb) || jsonb_build_object('success', true, 'idempotent_replay', true);
  end if;

  if v_source_id is null then
    raise exception 'Contrato sem fonte de capital vinculada.';
  end if;

  select balance into v_source_before
    from public.fontes
   where id = v_source_id
     and profile_id = v_profile_id
     and archived_at is null
   for update;

  if not found then
    raise exception 'Fonte de capital do contrato não encontrada ou arquivada.';
  end if;

  -- Calcular total de principal em aberto nas parcelas
  select coalesce(sum(coalesce(principal_remaining, 0)), 0), min(id)
    into v_total_open_principal, v_first_inst_id
    from public.parcelas
   where loan_id = p_loan_id
     and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CANCELADO', 'RENEGOCIADO')
     and coalesce(principal_remaining, 0) + coalesce(interest_remaining, 0) + coalesce(late_fee_accrued, 0) > 0.005;

  if v_total_open_principal < 0.005 or v_first_inst_id is null then
    raise exception 'Não há parcelas em aberto com saldo principal disponível para abatimento.';
  end if;

  if v_reduction > v_total_open_principal + 0.005 then
    raise exception 'O abatimento informado (R$ %) supera o principal em aberto nas parcelas (R$ %).', v_reduction, v_total_open_principal;
  end if;

  v_operator_id := case when v_is_service then p_operator_id else private.financial_actor_profile_id() end;

  -- Distribuir o abatimento nas parcelas abertas da última para a primeira
  v_reduction_rem := v_reduction;

  for r in
    select id, coalesce(principal_remaining, 0) as p_rem, coalesce(scheduled_principal, 0) as s_p,
           coalesce(amount, 0) as amt, coalesce(valor_parcela, 0) as vp
      from public.parcelas
     where loan_id = p_loan_id
       and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CANCELADO', 'RENEGOCIADO')
       and coalesce(principal_remaining, 0) > 0.005
     order by coalesce(data_vencimento, due_date) desc nulls last, numero_parcela desc nulls last, id desc
     for update
  loop
    exit when v_reduction_rem <= 0.005;

    declare
      v_alloc numeric := least(v_reduction_rem, r.p_rem);
    begin
      update public.parcelas
         set principal_remaining = greatest(0, round(r.p_rem - v_alloc, 2)),
             scheduled_principal = greatest(0, round(r.s_p - v_alloc, 2)),
             amount = greatest(0, round(r.amt - v_alloc, 2)),
             valor_parcela = greatest(0, round(r.vp - v_alloc, 2)),
             logs = coalesce(logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
               'at', now(),
               'type', 'PRINCIPAL_CORRECTION_REDUCTION',
               'amount', v_alloc,
               'reduction_total', v_reduction,
               'principal_before', v_current_principal,
               'principal_after', v_target,
               'operator_id', v_operator_id
             ))
       where id = r.id;

      v_reduction_rem := round(v_reduction_rem - v_alloc, 2);
    end;
  end loop;

  -- Creditar a fonte de capital
  update public.fontes
     set balance = round(coalesce(balance, 0) + v_reduction, 2)
   where id = v_source_id;

  -- Atualizar contrato
  update public.contratos
     set principal = v_target,
         total_to_receive = greatest(0, round(v_total_before - v_reduction, 2)),
         original_principal = v_original_principal
   where id = p_loan_id;

  select balance into v_source_after from public.fontes where id = v_source_id;

  v_result := jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'idempotency_key', p_idempotency_key,
    'amount_reduced', v_reduction,
    'contract_principal_before', round(v_current_principal, 2),
    'contract_principal_after', v_target,
    'source_balance_before', v_source_before,
    'source_balance_after', v_source_after,
    'idempotent_replay', false
  );

  -- Inserir registro contábil em transações
  insert into public.transacoes (
    id, profile_id, loan_id, installment_id, source_id, date, type, amount,
    principal_delta, interest_delta, late_fee_delta, notes, category,
    idempotency_key, operator_id, payment_type, meta
  ) values (
    v_tx_id, v_profile_id, p_loan_id, v_first_inst_id, v_source_id, now(),
    'PRINCIPAL_CORRECTION_REDUCTION', 0, -v_reduction, 0, 0,
    coalesce(nullif(trim(p_reason), ''), 'Abatimento de capital registrado na edição do contrato'),
    'CORRECAO', p_idempotency_key::text, v_operator_id, 'CORRECAO',
    jsonb_build_object(
      'engine', 'CONTRACT_PRINCIPAL_REDUCTION_V1',
      'before', jsonb_build_object(
        'source_balance', v_source_before,
        'contract_principal', v_current_principal,
        'contract_total_to_receive', v_total_before
      ),
      'after', jsonb_build_object(
        'source_balance', v_source_after,
        'contract_principal', v_target,
        'contract_total_to_receive', greatest(0, round(v_total_before - v_reduction, 2))
      ),
      'result', v_result
    )
  );

  return v_result;
end;
$$;

revoke all on function public.process_contract_principal_reduction_v1(uuid, uuid, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.process_contract_principal_reduction_v1(uuid, uuid, uuid, numeric, uuid, text) to authenticated, service_role;

-- Manter compatibilidade com process_daily_free_principal_correction_v1 redirecionando para a função geral
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
begin
  return public.process_contract_principal_reduction_v1(
    p_idempotency_key,
    p_loan_id,
    p_profile_id,
    p_target_principal,
    p_operator_id,
    coalesce(p_reason, 'Ajuste de capital pela edição da Diária Livre')
  );
end;
$$;

revoke all on function public.process_daily_free_principal_correction_v1(uuid, uuid, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.process_daily_free_principal_correction_v1(uuid, uuid, uuid, numeric, uuid, text) to authenticated, service_role;
