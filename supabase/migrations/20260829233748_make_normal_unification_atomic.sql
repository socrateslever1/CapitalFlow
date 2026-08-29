create or replace function public.normal_unify_contracts(
  p_main_loan_id uuid,
  p_loan_ids uuid[],
  p_main_installment_id uuid,
  p_principal numeric,
  p_interest numeric,
  p_late_fee numeric,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client_id uuid;
  v_owner_id uuid;
  v_contract_count integer;
  v_total numeric(14,2);
  v_charges numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;

  if p_main_loan_id is null
     or p_main_installment_id is null
     or p_profile_id is null
     or coalesce(array_length(p_loan_ids, 1), 0) < 2
     or not (p_main_loan_id = any(p_loan_ids)) then
    raise exception 'Selecao de contratos invalida para unificacao.';
  end if;

  if least(coalesce(p_principal, 0), coalesce(p_interest, 0), coalesce(p_late_fee, 0)) < 0 then
    raise exception 'A unificacao nao aceita componentes negativos.';
  end if;

  v_total := round(coalesce(p_principal, 0) + coalesce(p_interest, 0) + coalesce(p_late_fee, 0), 2);
  v_charges := round(coalesce(p_interest, 0) + coalesce(p_late_fee, 0), 2);
  if v_total <= 0.05 then
    raise exception 'Nao existe saldo valido para unificar.';
  end if;

  select client_id, owner_id
    into v_client_id, v_owner_id
    from public.contratos
   where id = p_main_loan_id
     and is_archived = false
   for update;

  if v_client_id is null or v_owner_id is distinct from p_profile_id then
    raise exception 'Contrato principal nao pertence ao perfil informado.';
  end if;

  select count(*)
    into v_contract_count
    from public.contratos
   where id = any(p_loan_ids)
     and client_id = v_client_id
     and owner_id = v_owner_id
     and is_archived = false;

  if v_contract_count <> array_length(p_loan_ids, 1) then
    raise exception 'Todos os contratos devem pertencer ao mesmo cliente e perfil.';
  end if;

  if not exists (
    select 1
      from public.parcelas
     where id = p_main_installment_id
       and loan_id = p_main_loan_id
  ) then
    raise exception 'Parcela principal nao pertence ao contrato principal.';
  end if;

  update public.contratos
     set principal = round(coalesce(p_principal, 0), 2),
         total_to_receive = v_total,
         interest_rate = 0,
         fine_percent = 0,
         daily_interest_percent = 0,
         policies_snapshot = coalesce(policies_snapshot, '{}'::jsonb) || jsonb_build_object(
           'interestRate', 0,
           'finePercent', 0,
           'dailyInterestPercent', 0,
           'normalUnificationFrozen', true
         ),
         status = 'PENDING',
         acordo_ativo_id = null,
         notes = concat_ws(E'\n', nullif(notes, ''),
           '[UNIFICACAO_NORMAL_CONGELADA] Saldo consolidado sem reaplicacao de juros ou mora.')
   where id = p_main_loan_id;

  update public.parcelas
     set status = 'RENEGOCIADO'
   where loan_id = p_main_loan_id
     and id <> p_main_installment_id
     and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO');

  update public.parcelas
     set scheduled_principal = round(coalesce(p_principal, 0), 2),
         scheduled_interest = v_charges,
         principal_remaining = round(coalesce(p_principal, 0), 2),
         interest_remaining = v_charges,
         late_fee_accrued = 0,
         paid_principal = 0,
         paid_interest = 0,
         paid_late_fee = 0,
         paid_total = 0,
         amount = v_total,
         valor_parcela = v_total,
         status = 'PENDING'
   where id = p_main_installment_id;

  update public.contratos
     set status = 'RENEGOCIADO',
         acordo_ativo_id = null,
         notes = concat_ws(E'\n', nullif(notes, ''),
           format('[LEGADO_UNIFICACAO_NORMAL:%s] Contrato unificado no contrato principal.', left(p_main_loan_id::text, 8)))
   where id = any(p_loan_ids)
     and id <> p_main_loan_id;

  update public.parcelas
     set status = 'RENEGOCIADO'
   where loan_id = any(p_loan_ids)
     and loan_id <> p_main_loan_id
     and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO');

  insert into public.transacoes (
    id, loan_id, profile_id, date, type, category, amount,
    principal_delta, interest_delta, late_fee_delta, notes, meta
  ) values (
    gen_random_uuid(), p_main_loan_id, p_profile_id, now(),
    'NORMAL_UNIFICATION_CREATED', 'GERAL', 0, 0, 0, 0,
    format('Unificacao normal de %s contrato(s). Total congelado: R$ %s.', array_length(p_loan_ids, 1), v_total),
    jsonb_build_object(
      'loan_ids', p_loan_ids,
      'principal', round(coalesce(p_principal, 0), 2),
      'interest', round(coalesce(p_interest, 0), 2),
      'late_fee', round(coalesce(p_late_fee, 0), 2),
      'total', v_total,
      'rates_frozen', true
    )
  );

  return jsonb_build_object(
    'main_loan_id', p_main_loan_id,
    'principal', round(coalesce(p_principal, 0), 2),
    'charges', v_charges,
    'total', v_total
  );
end;
$$;

revoke all on function public.normal_unify_contracts(uuid, uuid[], uuid, numeric, numeric, numeric, uuid) from public, anon;
grant execute on function public.normal_unify_contracts(uuid, uuid[], uuid, numeric, numeric, numeric, uuid) to authenticated;
