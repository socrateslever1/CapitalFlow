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
  v_operation_id uuid := gen_random_uuid();
  v_before jsonb;
  v_after jsonb;
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

  if exists (
    select 1
      from public.acordos_inadimplencia a
     where a.loan_id = any(p_loan_ids)
       and upper(coalesce(a.status, '')) in ('ATIVO', 'ACTIVE')
  ) then
    raise exception 'A unificacao normal nao aceita contratos com acordo ativo. Cancele ou quebre o acordo antes de unificar.';
  end if;

  select jsonb_build_object(
    'contracts', coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb),
    'installments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.loan_id, p.numero_parcela, p.id)
        from public.parcelas p
       where p.loan_id = any(p_loan_ids)
    ), '[]'::jsonb),
    'active_agreements', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
        from public.acordos_inadimplencia a
       where a.loan_id = any(p_loan_ids)
         and upper(coalesce(a.status, '')) in ('ATIVO', 'ACTIVE')
    ), '[]'::jsonb)
  )
    into v_before
    from public.contratos c
   where c.id = any(p_loan_ids);

  if not exists (
    select 1
      from public.parcelas
     where id = p_main_installment_id
       and loan_id = p_main_loan_id
  ) then
    raise exception 'Parcela principal nao pertence ao contrato principal.';
  end if;

  update public.contratos
     set principal = v_total,
         total_to_receive = v_total,
         policies_snapshot = coalesce(policies_snapshot, '{}'::jsonb) - 'normalUnificationFrozen',
         status = 'PENDING',
         acordo_ativo_id = null,
         notes = concat_ws(E'\n', nullif(notes, ''),
           '[UNIFICACAO_NORMAL] Saldo consolidado como nova base do contrato principal, mantendo cobranca normal.')
   where id = p_main_loan_id;

  update public.parcelas
     set status = 'RENEGOCIADO'
   where loan_id = p_main_loan_id
     and id <> p_main_installment_id
     and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO');

  update public.parcelas
     set scheduled_principal = v_total,
         scheduled_interest = 0,
         principal_remaining = v_total,
         interest_remaining = 0,
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
    v_operation_id, p_main_loan_id, p_profile_id, now(),
    'NORMAL_UNIFICATION_CREATED', 'GERAL', 0, 0, 0, 0,
    format('Unificacao normal de %s contrato(s). Nova base: R$ %s. Cobranca normal mantida.', array_length(p_loan_ids, 1), v_total),
    jsonb_build_object(
      'operation_id', v_operation_id,
      'loan_ids', p_loan_ids,
      'principal', round(coalesce(p_principal, 0), 2),
      'interest', round(coalesce(p_interest, 0), 2),
      'late_fee', round(coalesce(p_late_fee, 0), 2),
      'total', v_total,
      'rates_frozen', false,
      'continues_normal_interest', true,
      'before', v_before
    )
  );

  select jsonb_build_object(
    'contracts', coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb),
    'installments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.loan_id, p.numero_parcela, p.id)
        from public.parcelas p
       where p.loan_id = any(p_loan_ids)
    ), '[]'::jsonb)
  )
    into v_after
    from public.contratos c
   where c.id = any(p_loan_ids);

  update public.transacoes
     set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('after', v_after)
   where id = v_operation_id;

  return jsonb_build_object(
    'main_loan_id', p_main_loan_id,
    'principal', v_total,
    'original_principal', round(coalesce(p_principal, 0), 2),
    'capitalized_charges', v_charges,
    'total', v_total,
    'continues_normal_interest', true
  );
end;
$$;

create or replace function public.reverse_normal_unification(
  p_operation_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx public.transacoes%rowtype;
  v_before jsonb;
  v_contract jsonb;
  v_installment jsonb;
  v_agreement jsonb;
  v_loan_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;

  select *
    into v_tx
    from public.transacoes
   where id = p_operation_id
     and profile_id = p_profile_id
     and type = 'NORMAL_UNIFICATION_CREATED'
   for update;

  if v_tx.id is null then
    raise exception 'Unificacao normal nao encontrada para este perfil.';
  end if;

  if coalesce(v_tx.meta, '{}'::jsonb) ? 'reversed_at' then
    raise exception 'Esta unificacao normal ja foi desfeita.';
  end if;

  v_before := v_tx.meta -> 'before';
  if v_before is null or jsonb_typeof(v_before -> 'contracts') <> 'array' or jsonb_typeof(v_before -> 'installments') <> 'array' then
    raise exception 'Historico insuficiente para desfazer esta unificacao.';
  end if;

  select array_agg((item ->> 'id')::uuid)
    into v_loan_ids
    from jsonb_array_elements(v_before -> 'contracts') item;

  if coalesce(array_length(v_loan_ids, 1), 0) = 0 then
    raise exception 'Historico de contratos vazio.';
  end if;

  if exists (
    select 1
      from public.contratos c
     where c.id = any(v_loan_ids)
       and c.owner_id is distinct from p_profile_id
  ) then
    raise exception 'Os contratos da unificacao nao pertencem ao perfil informado.';
  end if;

  for v_contract in select * from jsonb_array_elements(v_before -> 'contracts')
  loop
    update public.contratos
       set client_id = nullif(v_contract ->> 'client_id', '')::uuid,
           source_id = nullif(v_contract ->> 'source_id', '')::uuid,
           operador_responsavel_id = nullif(v_contract ->> 'operador_responsavel_id', '')::uuid,
           debtor_name = v_contract ->> 'debtor_name',
           debtor_phone = v_contract ->> 'debtor_phone',
           debtor_document = v_contract ->> 'debtor_document',
           debtor_address = v_contract ->> 'debtor_address',
           principal = nullif(v_contract ->> 'principal', '')::numeric,
           interest_rate = nullif(v_contract ->> 'interest_rate', '')::numeric,
           fine_percent = nullif(v_contract ->> 'fine_percent', '')::numeric,
           daily_interest_percent = nullif(v_contract ->> 'daily_interest_percent', '')::numeric,
           start_date = nullif(v_contract ->> 'start_date', '')::date,
           total_to_receive = nullif(v_contract ->> 'total_to_receive', '')::numeric,
           status = v_contract ->> 'status',
           is_archived = coalesce((v_contract ->> 'is_archived')::boolean, false),
           guarantee_description = v_contract ->> 'guarantee_description',
           preferred_payment_method = v_contract ->> 'preferred_payment_method',
           pix_key = v_contract ->> 'pix_key',
           notes = v_contract ->> 'notes',
           billing_cycle = v_contract ->> 'billing_cycle',
           amortization_type = v_contract ->> 'amortization_type',
           payment_signals = coalesce(v_contract -> 'payment_signals', '[]'::jsonb),
           custom_documents = coalesce(v_contract -> 'custom_documents', '[]'::jsonb),
           policies_snapshot = v_contract -> 'policies_snapshot',
           funding_total_payable = nullif(v_contract ->> 'funding_total_payable', '')::numeric,
           funding_cost = nullif(v_contract ->> 'funding_cost', '')::numeric,
           funding_provider = v_contract ->> 'funding_provider',
           funding_fee_percent = nullif(v_contract ->> 'funding_fee_percent', '')::numeric,
           portal_token = nullif(v_contract ->> 'portal_token', '')::uuid,
           portal_shortcode = v_contract ->> 'portal_shortcode',
           acordo_ativo_id = nullif(v_contract ->> 'acordo_ativo_id', '')::uuid
     where id = (v_contract ->> 'id')::uuid;
  end loop;

  for v_installment in select * from jsonb_array_elements(v_before -> 'installments')
  loop
    update public.parcelas
       set loan_id = (v_installment ->> 'loan_id')::uuid,
           numero_parcela = nullif(v_installment ->> 'numero_parcela', '')::integer,
           data_vencimento = nullif(v_installment ->> 'data_vencimento', '')::date,
           valor_parcela = nullif(v_installment ->> 'valor_parcela', '')::numeric,
           amount = nullif(v_installment ->> 'amount', '')::numeric,
           scheduled_principal = nullif(v_installment ->> 'scheduled_principal', '')::numeric,
           scheduled_interest = nullif(v_installment ->> 'scheduled_interest', '')::numeric,
           principal_remaining = nullif(v_installment ->> 'principal_remaining', '')::numeric,
           interest_remaining = nullif(v_installment ->> 'interest_remaining', '')::numeric,
           late_fee_accrued = nullif(v_installment ->> 'late_fee_accrued', '')::numeric,
           paid_principal = nullif(v_installment ->> 'paid_principal', '')::numeric,
           paid_interest = nullif(v_installment ->> 'paid_interest', '')::numeric,
           paid_late_fee = nullif(v_installment ->> 'paid_late_fee', '')::numeric,
           paid_total = nullif(v_installment ->> 'paid_total', '')::numeric,
           status = v_installment ->> 'status',
           paid_date = nullif(v_installment ->> 'paid_date', '')::date,
           av_applied = nullif(v_installment ->> 'av_applied', '')::numeric,
           renewal_count = coalesce(nullif(v_installment ->> 'renewal_count', '')::integer, 0),
           logs = coalesce(v_installment -> 'logs', '[]'::jsonb),
           updated_at = now()
     where id = (v_installment ->> 'id')::uuid;
  end loop;

  for v_agreement in select * from jsonb_array_elements(coalesce(v_before -> 'active_agreements', '[]'::jsonb))
  loop
    update public.acordos_inadimplencia
       set status = v_agreement ->> 'status',
           updated_at = now()
     where id = (v_agreement ->> 'id')::uuid;
  end loop;

  update public.transacoes
     set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
           'reversed_at', now(),
           'reversed_by', auth.uid()
         ),
         notes = concat_ws(E'\n', nullif(notes, ''), '[DESFEITA] Unificacao normal revertida pelo operador.')
   where id = p_operation_id;

  insert into public.transacoes (
    id, loan_id, profile_id, date, type, category, amount,
    principal_delta, interest_delta, late_fee_delta, notes, meta
  ) values (
    gen_random_uuid(), v_tx.loan_id, p_profile_id, now(),
    'NORMAL_UNIFICATION_REVERSED', 'AUDIT', 0, 0, 0, 0,
    'Unificacao normal desfeita e contratos restaurados a partir do snapshot.',
    jsonb_build_object('reversed_operation_id', p_operation_id, 'loan_ids', v_loan_ids)
  );

  return jsonb_build_object('ok', true, 'loan_ids', v_loan_ids);
end;
$$;

revoke all on function public.normal_unify_contracts(uuid, uuid[], uuid, numeric, numeric, numeric, uuid) from public, anon;
grant execute on function public.normal_unify_contracts(uuid, uuid[], uuid, numeric, numeric, numeric, uuid) to authenticated;
revoke all on function public.reverse_normal_unification(uuid, uuid) from public, anon;
grant execute on function public.reverse_normal_unification(uuid, uuid) to authenticated;
