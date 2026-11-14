-- Reclassifica recebimentos antigos sem alterar o recebimento, a parcela ou o contrato.
-- A operação é explícita, auditável e só pode ser executada pelo administrador master.
create table if not exists public.wallet_historical_receipt_reconciliations (
  operation_id uuid primary key references public.financial_operations(operation_id),
  owner_user_id uuid not null,
  profile_id uuid not null references public.perfis(id),
  destination_account_id uuid,
  destination_source_id uuid,
  amount_received numeric(14,2) not null,
  principal_paid numeric(14,2) not null,
  interest_paid numeric(14,2) not null,
  late_fee_paid numeric(14,2) not null,
  reason text not null,
  reconciled_at timestamptz not null default now(),
  reconciled_by uuid not null
);

create unique index if not exists wallet_historical_receipt_reconciliations_operation_idx
  on public.wallet_historical_receipt_reconciliations(operation_id);

alter table public.wallet_historical_receipt_reconciliations enable row level security;
revoke all on public.wallet_historical_receipt_reconciliations from public, anon, authenticated;
grant all on public.wallet_historical_receipt_reconciliations to service_role;

create or replace function public.personal_wallet_list_historical_receipts()
returns table (
  operation_id uuid,
  loan_id uuid,
  installment_id uuid,
  payment_date date,
  debtor_name text,
  amount_received numeric,
  principal_paid numeric,
  interest_paid numeric,
  late_fee_paid numeric,
  principal_source_id uuid,
  profit_source_id uuid,
  principal_source_name text,
  profit_source_name text
)
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $fn$
declare
  v_profile uuid;
begin
  if not public.is_platform_super_admin() then
    raise exception 'Acesso restrito ao administrador master.';
  end if;

  select p.id into v_profile
    from public.perfis p
   where p.user_id = auth.uid() or p.id = auth.uid()
   order by (p.user_id = auth.uid()) desc, p.created_at asc nulls last
   limit 1;

  return query
  select fo.operation_id, fo.loan_id, fo.installment_id, fo.payment_date,
         nullif(btrim(c.debtor_name), ''), round(fo.amount_received, 2),
         round(fo.principal_paid, 2), round(fo.interest_paid, 2), round(fo.late_fee_paid, 2),
         fo.source_id, fo.profit_source_id, ps.name, fs.name
    from public.financial_operations fo
    join public.contratos c on c.id = fo.loan_id
    left join public.fontes ps on ps.id = fo.source_id
    left join public.fontes fs on fs.id = fo.profit_source_id
   where fo.profile_id = v_profile
     and fo.status = 'COMPLETED'
     and fo.operation_type <> 'REVERSAL'
     and fo.original_operation_id is null
     and fo.wallet_destination_account_id is null
     and fo.destination_source_id is null
     and not exists (
       select 1 from public.wallet_receipt_destinations d
        where d.idempotency_key = fo.idempotency_key
     )
     and not exists (
       select 1 from public.wallet_historical_receipt_reconciliations h
        where h.operation_id = fo.operation_id
     )
   order by fo.payment_date asc, fo.created_at asc;
end
$fn$;

create or replace function public.personal_wallet_reconcile_historical_receipt(
  p_operation_id uuid,
  p_destination_account_id uuid default null,
  p_destination_source_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $fn$
declare
  v_operation public.financial_operations%rowtype;
  v_existing public.wallet_historical_receipt_reconciliations%rowtype;
  v_profile uuid;
  v_profit numeric(14,2);
  v_route public.wallet_receipt_destinations%rowtype;
begin
  if not public.is_platform_super_admin() then
    raise exception 'Acesso restrito ao administrador master.';
  end if;
  if p_operation_id is null
     or (p_destination_account_id is null and p_destination_source_id is null)
     or nullif(btrim(coalesce(p_reason, '')), '') is null
     or length(btrim(p_reason)) > 500 then
    raise exception 'Operacao, destino e motivo sao obrigatorios.';
  end if;

  select p.id into v_profile
    from public.perfis p
   where p.user_id = auth.uid() or p.id = auth.uid()
   order by (p.user_id = auth.uid()) desc, p.created_at asc nulls last
   limit 1;

  select * into v_operation
    from public.financial_operations
   where operation_id = p_operation_id
     and profile_id = v_profile
   for update;
  if not found then raise exception 'Recebimento nao encontrado para este perfil.'; end if;

  select * into v_existing
    from public.wallet_historical_receipt_reconciliations
   where operation_id = p_operation_id
   for update;
  if found then
    if v_existing.destination_account_id is distinct from p_destination_account_id
       or v_existing.destination_source_id is distinct from p_destination_source_id then
      raise exception 'Este recebimento ja foi conciliado para outro destino.';
    end if;
    return jsonb_build_object('operation_id', p_operation_id, 'replayed', true,
      'destination_account_id', v_existing.destination_account_id,
      'destination_source_id', v_existing.destination_source_id);
  end if;

  if v_operation.status <> 'COMPLETED'
     or v_operation.operation_type = 'REVERSAL'
     or v_operation.original_operation_id is not null
     or v_operation.wallet_destination_account_id is not null
     or v_operation.destination_source_id is not null then
    raise exception 'Recebimento nao elegivel para reconciliacao historica.';
  end if;

  v_profit := round(coalesce(v_operation.interest_paid, 0) + coalesce(v_operation.late_fee_paid, 0), 2);
  if abs(v_operation.amount_received - v_operation.principal_paid - v_profit) > 0.02 then
    raise exception 'Composicao contabil nao conciliada com o valor recebido.';
  end if;

  if p_destination_source_id is not null and not exists (
    select 1 from public.fontes f
     where f.id = p_destination_source_id
       and f.profile_id = v_profile
       and f.archived_at is null
  ) then
    raise exception 'Fonte de destino nao pertence ao perfil ou esta arquivada.';
  end if;

  if p_destination_account_id is not null and not exists (
    select 1 from public.personal_wallet_accounts a
     where a.id = p_destination_account_id
       and a.owner_user_id = auth.uid()
       and a.archived_at is null
  ) then
    raise exception 'Conta de destino inativa ou indisponivel.';
  end if;

  if exists (select 1 from public.wallet_receipt_destinations d where d.idempotency_key = v_operation.idempotency_key) then
    raise exception 'Este recebimento ja possui um roteamento registrado.';
  end if;

  insert into public.wallet_receipt_destinations(
    idempotency_key, owner_user_id, loan_id, account_id, destination_source_id
  ) values (
    v_operation.idempotency_key, auth.uid(), v_operation.loan_id,
    p_destination_account_id, p_destination_source_id
  );

  perform public.wallet_route_receipt_internal(
    v_operation.idempotency_key, v_operation.loan_id, v_operation.installment_id,
    v_operation.profile_id, v_operation.amount_received, v_operation.principal_paid,
    v_operation.interest_paid, v_operation.late_fee_paid, v_operation.source_id,
    v_operation.profit_source_id, v_operation.payment_date, 'V4'
  );

  select * into v_route from public.wallet_receipt_destinations
   where idempotency_key = v_operation.idempotency_key;
  if v_route.applied_at is null then
    raise exception 'Roteamento historico nao foi aplicado.';
  end if;

  update public.financial_operations
     set wallet_destination_account_id = v_route.account_id,
         destination_source_id = v_route.routed_source_id
   where operation_id = v_operation.operation_id;

  insert into public.wallet_historical_receipt_reconciliations(
    operation_id, owner_user_id, profile_id, destination_account_id, destination_source_id,
    amount_received, principal_paid, interest_paid, late_fee_paid, reason, reconciled_by
  ) values (
    v_operation.operation_id, auth.uid(), v_operation.profile_id, v_route.account_id,
    v_route.routed_source_id, round(v_operation.amount_received, 2),
    round(v_operation.principal_paid, 2), round(v_operation.interest_paid, 2),
    round(v_operation.late_fee_paid, 2), btrim(p_reason), auth.uid()
  );

  return jsonb_build_object('operation_id', v_operation.operation_id, 'replayed', false,
    'destination_account_id', v_route.account_id, 'destination_source_id', v_route.routed_source_id,
    'amount_received', round(v_operation.amount_received, 2));
end
$fn$;

revoke all on function public.personal_wallet_list_historical_receipts() from public, anon;
grant execute on function public.personal_wallet_list_historical_receipts() to authenticated;
revoke all on function public.personal_wallet_reconcile_historical_receipt(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.personal_wallet_reconcile_historical_receipt(uuid, uuid, uuid, text) to authenticated;

comment on table public.wallet_historical_receipt_reconciliations is
  'Auditoria das reclassificacoes explicitas de recebimentos anteriores ao roteamento da Carteira.';

notify pgrst, 'reload schema';
