-- Unificação de contratos mantendo a cobrança normal (decisão do proprietário, 27/11/2026):
-- soma o principal dos contratos no contrato principal; juros e mora em aberto (que já incluem
-- os juros do mês de cada contrato) ficam na 1ª parcela; sem nada em aberto, o cálculo mensal
-- cobra principal × taxa. A taxa, a multa e a mora são as do contrato principal
-- e continuam valendo nos ciclos seguintes. Só para contrato mensal. Uma única transação,
-- idempotente por p_request_id. Não altera a unificação com saldo congelado existente.

create or replace function public.unify_contracts_keep_interest(
  p_main_loan_id uuid,
  p_loan_ids uuid[],
  p_main_installment_id uuid,
  p_principal numeric,
  p_charges numeric,
  p_first_due_date date,
  p_profile_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client_id uuid;
  v_owner_id uuid;
  v_cycle text;
  v_rate numeric;
  v_fine numeric;
  v_daily numeric;
  v_snapshot jsonb;
  v_count integer;
  v_principal numeric(14,2);
  v_charges numeric(14,2);
  v_month_interest numeric(14,2);
  v_interest numeric(14,2);
  v_existing jsonb;
begin
  if auth.uid() is null then raise exception 'Sessao autenticada obrigatoria.'; end if;
  if p_request_id is null or p_main_loan_id is null or p_main_installment_id is null or p_profile_id is null
     or p_first_due_date is null or coalesce(array_length(p_loan_ids, 1), 0) < 2
     or not (p_main_loan_id = any(p_loan_ids)) then
    raise exception 'Selecao de contratos invalida para unificacao.';
  end if;

  -- Repetição da mesma requisição devolve o resultado já gravado.
  select meta into v_existing from public.transacoes
   where loan_id = p_main_loan_id and type = 'UNIFICATION_KEEP_INTEREST' and meta ->> 'request_id' = p_request_id::text
   limit 1;
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;

  v_principal := round(coalesce(p_principal, 0), 2);
  v_charges := round(coalesce(p_charges, 0), 2);
  if v_principal <= 0 or v_charges < 0 then raise exception 'Valores invalidos para unificacao.'; end if;
  if p_first_due_date < (now() at time zone 'America/Manaus')::date then raise exception 'O primeiro vencimento nao pode estar no passado.'; end if;

  select client_id, owner_id, upper(coalesce(billing_cycle, 'MONTHLY')), coalesce(interest_rate, 0),
         coalesce(fine_percent, 0), coalesce(daily_interest_percent, 0), coalesce(policies_snapshot, '{}'::jsonb)
    into v_client_id, v_owner_id, v_cycle, v_rate, v_fine, v_daily, v_snapshot
    from public.contratos
   where id = p_main_loan_id and is_archived = false
   for update;
  if v_client_id is null or v_owner_id is distinct from p_profile_id then
    raise exception 'Contrato principal nao pertence ao perfil informado.';
  end if;
  if v_cycle <> 'MONTHLY' then
    raise exception 'Unificacao com juros normais esta disponivel apenas para contrato mensal.';
  end if;
  -- A tela calcula pela taxa do snapshot; contrato com taxa zerada (ex.: unificação congelada) é recusado.
  if v_rate <= 0 or coalesce((v_snapshot ->> 'interestRate')::numeric, v_rate) <= 0 or v_snapshot ? 'normalUnificationFrozen' then
    raise exception 'O contrato principal esta sem taxa de juros (saldo congelado): escolha outro contrato como principal.';
  end if;

  -- Trava todos os contratos na mesma ordem e confere cliente, perfil e situação.
  perform 1 from public.contratos where id = any(p_loan_ids) order by id for update;
  select count(*) into v_count from public.contratos
   where id = any(p_loan_ids) and client_id = v_client_id and owner_id = v_owner_id and is_archived = false
     and acordo_ativo_id is null and upper(coalesce(status, '')) <> 'RENEGOCIADO'
     and upper(coalesce(billing_cycle, 'MONTHLY')) = 'MONTHLY';
  if v_count <> array_length(p_loan_ids, 1) then
    raise exception 'Todos os contratos devem ser mensais, do mesmo cliente, sem acordo ativo e ainda nao unificados.';
  end if;
  if not exists (select 1 from public.parcelas where id = p_main_installment_id and loan_id = p_main_loan_id) then
    raise exception 'Parcela principal nao pertence ao contrato principal.';
  end if;

  -- Os juros do mês de cada contrato já estão nos encargos em aberto: não somar de novo.
  v_month_interest := round(v_principal * v_rate / 100, 2);
  v_interest := v_charges;

  -- Contrato principal: soma o principal e mantém taxa, multa e mora (sem congelar).
  update public.contratos
     set principal = v_principal,
         total_to_receive = v_principal + greatest(v_interest, v_month_interest),
         next_due_date = p_first_due_date,
         policies_snapshot = (v_snapshot - 'normalUnificationFrozen') || jsonb_build_object(
           'interestRate', v_rate, 'finePercent', v_fine, 'dailyInterestPercent', v_daily),
         status = 'PENDING',
         acordo_ativo_id = null,
         notes = concat_ws(E'\n', nullif(notes, ''),
           format('[UNIFICACAO_JUROS_NORMAIS] %s contrato(s) somados; cobranca normal mantida.', array_length(p_loan_ids, 1)))
   where id = p_main_loan_id;

  update public.parcelas
     set status = 'RENEGOCIADO'
   where loan_id = p_main_loan_id and id <> p_main_installment_id
     and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO');

  -- 1ª parcela: principal somado; juros e mora em aberto; novo vencimento.
  update public.parcelas
     set scheduled_principal = v_principal,
         scheduled_interest = v_interest,
         principal_remaining = v_principal,
         interest_remaining = v_interest,
         late_fee_accrued = 0,
         paid_principal = 0,
         paid_interest = 0,
         paid_late_fee = 0,
         paid_total = 0,
         amount = v_principal + v_interest,
         valor_parcela = v_principal + v_interest,
         due_date = p_first_due_date,
         data_vencimento = p_first_due_date,
         status = 'PENDING'
   where id = p_main_installment_id;

  update public.contratos
     set status = 'RENEGOCIADO',
         acordo_ativo_id = null,
         notes = concat_ws(E'\n', nullif(notes, ''),
           format('[UNIFICADO_COM_JUROS:%s] Contrato somado ao contrato principal.', left(p_main_loan_id::text, 8)))
   where id = any(p_loan_ids) and id <> p_main_loan_id;

  update public.parcelas
     set status = 'RENEGOCIADO'
   where loan_id = any(p_loan_ids) and loan_id <> p_main_loan_id
     and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO');

  insert into public.transacoes (
    id, loan_id, profile_id, date, type, category, amount,
    principal_delta, interest_delta, late_fee_delta, notes, meta
  ) values (
    gen_random_uuid(), p_main_loan_id, p_profile_id, now(),
    'UNIFICATION_KEEP_INTEREST', 'GERAL', 0, 0, 0, 0,
    format('Unificação de %s contratos com juros normais.', array_length(p_loan_ids, 1)),
    jsonb_build_object('request_id', p_request_id, 'loan_ids', p_loan_ids, 'principal', v_principal,
      'charges', v_charges, 'month_interest', v_month_interest, 'first_due_date', p_first_due_date,
      'rates_frozen', false)
  );

  return jsonb_build_object('main_loan_id', p_main_loan_id, 'principal', v_principal,
    'charges', v_charges, 'month_interest', v_month_interest, 'first_due_date', p_first_due_date,
    'replayed', false);
end;
$$;

revoke all on function public.unify_contracts_keep_interest(uuid, uuid[], uuid, numeric, numeric, date, uuid, uuid) from public, anon;
grant execute on function public.unify_contracts_keep_interest(uuid, uuid[], uuid, numeric, numeric, date, uuid, uuid) to authenticated;
