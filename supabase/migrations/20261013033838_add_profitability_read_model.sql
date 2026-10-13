-- Read-only profitability model. Financial values come exclusively from the
-- immutable Payment Engine V4 operation ledger. Reversed operations have no
-- economic effect and principal recovery is reported separately from profit.
alter table if exists public.contratos
  add column if not exists original_principal numeric(14,2);

comment on column public.contratos.original_principal is
  'Valor inicial preservado para auditoria; principal permanece como valor atual do contrato.';

create or replace function public.skill_get_profitability_v1(
  p_profile_id uuid,
  p_scope text default 'CLIENT',
  p_client_id uuid default null,
  p_contract_id uuid default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_scope text := upper(trim(coalesce(p_scope, 'CLIENT')));
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_result jsonb;
begin
  if p_profile_id is null or not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para consultar este perfil.' using errcode = '42501';
  end if;
  if v_scope not in ('CLIENT', 'CONTRACT', 'RANKING') then
    raise exception 'Escopo de rentabilidade invalido.' using errcode = '22023';
  end if;
  if v_scope = 'CLIENT' and p_client_id is null then
    raise exception 'Cliente obrigatorio.' using errcode = '22023';
  end if;
  if v_scope = 'CONTRACT' and p_contract_id is null then
    raise exception 'Contrato obrigatorio.' using errcode = '22023';
  end if;

  with scoped_contracts as (
    select c.id as contract_id, c.client_id, cl.name as client_name,
      round(greatest(coalesce(c.original_principal, c.principal, 0), 0)::numeric, 2) as invested_principal
    from public.contratos c
    left join public.clientes cl on cl.id = c.client_id and cl.owner_id = p_profile_id
    where coalesce(c.profile_id, c.owner_id) = p_profile_id
      and (v_scope <> 'CLIENT' or c.client_id = p_client_id)
      and (v_scope <> 'CONTRACT' or c.id = p_contract_id)
  ), operation_totals as (
    select fo.loan_id as contract_id,
      round(coalesce(sum(fo.principal_paid), 0)::numeric, 2) as principal_recovered,
      round(coalesce(sum(fo.interest_paid), 0)::numeric, 2) as interest_received,
      round(coalesce(sum(fo.late_fee_paid), 0)::numeric, 2) as late_fee_received,
      round(coalesce(sum(fo.principal_forgiven + fo.interest_forgiven + fo.late_fee_forgiven), 0)::numeric, 2) as forgiven_amount
    from public.financial_operations fo
    join scoped_contracts sc on sc.contract_id = fo.loan_id
    where fo.profile_id = p_profile_id and fo.status = 'COMPLETED' and fo.operation_type <> 'REVERSAL'
    group by fo.loan_id
  ), contract_rows as (
    select sc.client_id, sc.client_name, sc.contract_id, sc.invested_principal,
      coalesce(ot.principal_recovered, 0) as principal_recovered,
      coalesce(ot.interest_received, 0) as interest_received,
      coalesce(ot.late_fee_received, 0) as late_fee_received,
      round((coalesce(ot.interest_received, 0) + coalesce(ot.late_fee_received, 0))::numeric, 2) as realized_profit,
      coalesce(ot.forgiven_amount, 0) as forgiven_amount
    from scoped_contracts sc left join operation_totals ot using (contract_id)
  ), result_rows as (
    select client_id, max(client_name) as client_name,
      case when v_scope = 'CONTRACT' then contract_id else null end as contract_id,
      round(sum(invested_principal), 2) as invested_principal,
      round(sum(principal_recovered), 2) as principal_recovered,
      round(sum(interest_received), 2) as interest_received,
      round(sum(late_fee_received), 2) as late_fee_received,
      round(sum(realized_profit), 2) as realized_profit,
      round(sum(forgiven_amount), 2) as forgiven_amount,
      case when sum(invested_principal) > 0
        then round((sum(realized_profit) / sum(invested_principal) * 100)::numeric, 2)
        else null end as roi_percent
    from contract_rows
    group by client_id, case when v_scope = 'CONTRACT' then contract_id else null end
    order by realized_profit desc, client_name
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'clientId', client_id, 'clientName', client_name, 'contractId', contract_id,
    'investedPrincipal', invested_principal, 'principalRecovered', principal_recovered,
    'interestReceived', interest_received, 'lateFeeReceived', late_fee_received,
    'realizedProfit', realized_profit, 'forgivenAmount', forgiven_amount,
    'roiPercent', roi_percent
  ) order by realized_profit desc, client_name), '[]'::jsonb)
  into v_result from result_rows;

  return v_result;
end;
$$;

revoke all on function public.skill_get_profitability_v1(uuid, text, uuid, uuid, integer) from public, anon;
grant execute on function public.skill_get_profitability_v1(uuid, text, uuid, uuid, integer) to authenticated, service_role;

comment on function public.skill_get_profitability_v1(uuid, text, uuid, uuid, integer) is
  'Rentabilidade realizada por cliente ou contrato, calculada no ledger V4 e sem contar principal recuperado como lucro.';
