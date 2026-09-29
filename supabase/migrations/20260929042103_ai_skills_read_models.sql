-- Read models for CapitalFlow AI Skills.
-- These functions never perform financial mutations and never trust a profile
-- supplied by the caller without checking the authenticated actor.

create or replace function public.skill_find_clients_v1(
  p_profile_id uuid,
  p_query text,
  p_match_kind text default 'NAME',
  p_include_document boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_kind text := upper(trim(coalesce(p_match_kind, 'NAME')));
  v_result jsonb;
begin
  if p_profile_id is null or not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para consultar este perfil.' using errcode = '42501';
  end if;
  if length(v_query) < 2 then
    raise exception 'Consulta de cliente invalida.' using errcode = '22023';
  end if;
  if v_kind not in ('NAME', 'CODE', 'PHONE', 'DOCUMENT') then
    raise exception 'Tipo de consulta invalido.' using errcode = '22023';
  end if;
  if v_kind = 'DOCUMENT'
     and private.financial_actor_profile_id() is distinct from p_profile_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Consulta por documento restrita ao titular do perfil.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data ->> 'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'code', coalesce(c.client_number, c.access_code),
      'phone', c.phone,
      'document', case when p_include_document then
        '***' || right(regexp_replace(coalesce(c.document, c.cpf, c.cnpj, ''), '[^0-9]', '', 'g'), 4)
        else null end
    ) as row_data
    from public.clientes c
    where c.owner_id = p_profile_id
      and case v_kind
        when 'NAME' then unaccent(lower(c.name)) like '%' || unaccent(lower(v_query)) || '%'
        when 'CODE' then lower(coalesce(c.client_number, c.access_code, '')) = lower(v_query)
        when 'PHONE' then regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') like '%' || regexp_replace(v_query, '[^0-9]', '', 'g') || '%'
        when 'DOCUMENT' then regexp_replace(coalesce(c.document, c.cpf, c.cnpj, ''), '[^0-9]', '', 'g') = regexp_replace(v_query, '[^0-9]', '', 'g')
        else false
      end
    limit 11
  ) matches;

  return v_result;
end;
$$;

create or replace function public.skill_list_contracts_v1(
  p_profile_id uuid,
  p_contract_id uuid default null,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_profile_id is null or not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para consultar este perfil.' using errcode = '42501';
  end if;
  if p_contract_id is null and p_client_id is null then
    raise exception 'Contrato ou cliente obrigatorio.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data ->> 'createdAt' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'clientId', c.client_id,
      'clientName', c.debtor_name,
      'status', c.status,
      'billingCycle', c.billing_cycle,
      'startDate', c.start_date,
      'nextDueDate', c.next_due_date,
      'sourceId', c.source_id,
      'isArchived', coalesce(c.is_archived, false),
      'createdAt', c.created_at
    ) as row_data
    from public.contratos c
    where coalesce(c.profile_id, c.owner_id) = p_profile_id
      and (p_contract_id is null or c.id = p_contract_id)
      and (p_client_id is null or c.client_id = p_client_id)
    limit 20
  ) contracts;

  return v_result;
end;
$$;

create or replace function public.skill_get_debt_position_v1(
  p_profile_id uuid,
  p_contract_id uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_contract public.contratos%rowtype;
  v_agreement_id uuid;
  v_result jsonb;
begin
  if p_profile_id is null or not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para consultar este perfil.' using errcode = '42501';
  end if;

  select * into v_contract
  from public.contratos c
  where c.id = p_contract_id
    and coalesce(c.profile_id, c.owner_id) = p_profile_id;
  if not found then return null; end if;

  select a.id into v_agreement_id
  from public.acordos_inadimplencia a
  where a.loan_id = p_contract_id
    and a.profile_id = p_profile_id
    and upper(coalesce(a.status, '')) in ('ACTIVE', 'ATIVO')
  order by a.created_at desc
  limit 1;

  if v_agreement_id is not null then
    select jsonb_build_object(
      'contractId', v_contract.id,
      'clientId', v_contract.client_id,
      'clientName', v_contract.debtor_name,
      'contractStatus', v_contract.status,
      'source', 'AGREEMENT',
      'agreementId', v_agreement_id,
      'principal', round(coalesce(sum(greatest(coalesce(ap.amount, ap.valor, 0) - greatest(coalesce(ap.paid_amount, 0), coalesce(ap.valor_pago, 0)), 0)), 0)::numeric, 2),
      'interest', 0,
      'lateFee', 0,
      'totalDue', round(coalesce(sum(greatest(coalesce(ap.amount, ap.valor, 0) - greatest(coalesce(ap.paid_amount, 0), coalesce(ap.valor_pago, 0)), 0)), 0)::numeric, 2),
      'nextDueDate', min(coalesce(ap.due_date, ap.data_vencimento)) filter (where upper(coalesce(ap.status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')),
      'daysLate', coalesce(max(greatest(p_reference_date - coalesce(ap.due_date, ap.data_vencimento), 0)) filter (where upper(coalesce(ap.status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')), 0)
    ) into v_result
    from public.acordo_parcelas ap
    where ap.acordo_id = v_agreement_id;
  else
    select jsonb_build_object(
      'contractId', v_contract.id,
      'clientId', v_contract.client_id,
      'clientName', v_contract.debtor_name,
      'contractStatus', v_contract.status,
      'source', 'INSTALLMENTS',
      'principal', round(coalesce(sum(greatest(coalesce(p.principal_remaining, 0), 0)), 0)::numeric, 2),
      'interest', round(coalesce(sum(greatest(coalesce(p.interest_remaining, 0), 0)), 0)::numeric, 2),
      'lateFee', round(coalesce(sum(greatest(coalesce(p.late_fee_accrued, 0), 0)), 0)::numeric, 2),
      'totalDue', round(coalesce(sum(greatest(coalesce(p.principal_remaining, 0), 0) + greatest(coalesce(p.interest_remaining, 0), 0) + greatest(coalesce(p.late_fee_accrued, 0), 0)), 0)::numeric, 2),
      'nextDueDate', min(coalesce(p.data_vencimento, p.due_date)) filter (where upper(coalesce(p.status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'RENEGOCIADO', 'CANCELADO')),
      'daysLate', coalesce(max(greatest(p_reference_date - coalesce(p.data_vencimento, p.due_date), 0)) filter (where upper(coalesce(p.status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'RENEGOCIADO', 'CANCELADO')), 0)
    ) into v_result
    from public.parcelas p
    where p.loan_id = p_contract_id;
  end if;

  return v_result;
end;
$$;

create or replace function public.skill_list_installments_v1(
  p_profile_id uuid,
  p_contract_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_profile_id is null or not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para consultar este perfil.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contratos c
    where c.id = p_contract_id and coalesce(c.profile_id, c.owner_id) = p_profile_id
  ) then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'number', p.numero_parcela,
    'dueDate', coalesce(p.data_vencimento, p.due_date),
    'status', p.status,
    'principal', round(greatest(coalesce(p.principal_remaining, 0), 0)::numeric, 2),
    'interest', round(greatest(coalesce(p.interest_remaining, 0), 0)::numeric, 2),
    'lateFee', round(greatest(coalesce(p.late_fee_accrued, 0), 0)::numeric, 2),
    'total', round((greatest(coalesce(p.principal_remaining, 0), 0) + greatest(coalesce(p.interest_remaining, 0), 0) + greatest(coalesce(p.late_fee_accrued, 0), 0))::numeric, 2),
    'paidTotal', round(greatest(coalesce(p.paid_total, 0), 0)::numeric, 2)
  ) order by p.numero_parcela, coalesce(p.data_vencimento, p.due_date)), '[]'::jsonb)
  into v_result
  from public.parcelas p
  where p.loan_id = p_contract_id;
  return v_result;
end;
$$;

create or replace function public.skill_list_due_v1(
  p_profile_id uuid,
  p_from date,
  p_to date,
  p_only_overdue boolean default false,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_profile_id is null or not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para consultar este perfil.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_reference_date is null or p_from > p_to
     or (not p_only_overdue and p_to - p_from > 366) then
    raise exception 'Intervalo de vencimentos invalido.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'contractId', c.id,
    'clientId', c.client_id,
    'clientName', c.debtor_name,
    'installmentId', p.id,
    'number', p.numero_parcela,
    'dueDate', coalesce(p.data_vencimento, p.due_date),
    'status', p.status,
    'total', round((greatest(coalesce(p.principal_remaining, 0), 0) + greatest(coalesce(p.interest_remaining, 0), 0) + greatest(coalesce(p.late_fee_accrued, 0), 0))::numeric, 2),
    'daysLate', greatest(p_reference_date - coalesce(p.data_vencimento, p.due_date), 0)
  ) order by coalesce(p.data_vencimento, p.due_date), c.debtor_name), '[]'::jsonb)
  into v_result
  from public.parcelas p
  join public.contratos c on c.id = p.loan_id
  where coalesce(c.profile_id, c.owner_id) = p_profile_id
    and coalesce(c.is_archived, false) = false
    and upper(coalesce(p.status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'RENEGOCIADO', 'CANCELADO')
    and (
      (p_only_overdue and coalesce(p.data_vencimento, p.due_date) < p_reference_date)
      or
      (not p_only_overdue and coalesce(p.data_vencimento, p.due_date) between p_from and p_to)
    );
  return v_result;
end;
$$;

create or replace function public.skill_get_agreement_v1(
  p_profile_id uuid,
  p_contract_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_profile_id is null or not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para consultar este perfil.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'contractId', a.loan_id,
    'status', a.status,
    'type', coalesce(a.tipo_acordo, a.tipo),
    'negotiatedTotal', a.total_negociado,
    'installmentsCount', a.num_parcelas,
    'createdAt', a.created_at,
    'installments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ap.id,
        'number', ap.numero,
        'dueDate', coalesce(ap.due_date, ap.data_vencimento),
        'status', ap.status,
        'amount', coalesce(ap.amount, ap.valor, 0),
        'paidAmount', greatest(coalesce(ap.paid_amount, 0), coalesce(ap.valor_pago, 0)),
        'remaining', greatest(coalesce(ap.amount, ap.valor, 0) - greatest(coalesce(ap.paid_amount, 0), coalesce(ap.valor_pago, 0)), 0)
      ) order by ap.numero)
      from public.acordo_parcelas ap where ap.acordo_id = a.id
    ), '[]'::jsonb)
  ) into v_result
  from public.acordos_inadimplencia a
  where a.loan_id = p_contract_id
    and a.profile_id = p_profile_id
    and upper(coalesce(a.status, '')) in ('ACTIVE', 'ATIVO')
  order by a.created_at desc
  limit 1;
  return v_result;
end;
$$;

revoke all on function public.skill_find_clients_v1(uuid, text, text, boolean) from public, anon;
revoke all on function public.skill_list_contracts_v1(uuid, uuid, uuid) from public, anon;
revoke all on function public.skill_get_debt_position_v1(uuid, uuid, date) from public, anon;
revoke all on function public.skill_list_installments_v1(uuid, uuid) from public, anon;
revoke all on function public.skill_list_due_v1(uuid, date, date, boolean, date) from public, anon;
revoke all on function public.skill_get_agreement_v1(uuid, uuid) from public, anon;

grant execute on function public.skill_find_clients_v1(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.skill_list_contracts_v1(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.skill_get_debt_position_v1(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.skill_list_installments_v1(uuid, uuid) to authenticated, service_role;
grant execute on function public.skill_list_due_v1(uuid, date, date, boolean, date) to authenticated, service_role;
grant execute on function public.skill_get_agreement_v1(uuid, uuid) to authenticated, service_role;

comment on function public.skill_get_debt_position_v1(uuid, uuid, date) is
'Retorna a posicao persistida e autoritativa do contrato sem recalcular juros no cliente.';
;
