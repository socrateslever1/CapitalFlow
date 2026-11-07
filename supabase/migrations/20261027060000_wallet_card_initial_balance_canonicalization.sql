begin;

alter table public.personal_wallet_cards
  add column if not exists opening_reconciliation_requests jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from public.personal_wallet_cards
    where coalesce(initial_future_installments_balance, 0) <> coalesce(opening_unallocated_amount, 0)
  ) then
    raise exception 'Existem cartoes com saldos iniciais divergentes; reconcilie manualmente antes da canonicalizacao.';
  end if;
end $$;

update public.personal_wallet_cards
set initial_future_installments_balance = coalesce(opening_unallocated_amount, 0)
where coalesce(initial_future_installments_balance, 0) = 0
  and coalesce(opening_unallocated_amount, 0) > 0;

create or replace function private.wallet_recalculate_card_position(
  p_owner_id uuid,
  p_card_id uuid,
  p_competence_month date
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_limit numeric(14,2); v_initial numeric(14,2) := 0; v_month date;
  v_current numeric(14,2) := 0; v_native_future numeric(14,2) := 0;
  v_future numeric(14,2) := 0; v_committed numeric(14,2) := 0; v_free numeric(14,2) := 0;
begin
  v_month := date_trunc('month', coalesce(p_competence_month, current_date))::date;
  select credit_limit, coalesce(initial_future_installments_balance, 0)
    into v_limit, v_initial
  from public.personal_wallet_cards
  where id = p_card_id and owner_user_id = p_owner_id
  for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;

  v_current := private.wallet_effective_cycle_amount(p_owner_id, p_card_id, v_month);
  select coalesce(round(sum(private.wallet_effective_cycle_amount(p_owner_id, p_card_id, m.due_month)), 2), 0)
    into v_native_future
  from (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.owner_user_id = p_owner_id and e.card_id = p_card_id
      and e.status <> 'CANCELED' and i.status <> 'CANCELED'
      and i.due_month > v_month
  ) m;

  v_future := round(v_initial + v_native_future, 2);
  v_committed := round(v_current + v_future, 2);
  v_free := case when coalesce(v_limit, 0) - v_committed < 0 then 0 else round(coalesce(v_limit, 0) - v_committed, 2) end;

  update public.personal_wallet_cards
  set current_bill = v_current,
      used_limit = v_committed,
      available_limit = v_free,
      opening_unallocated_amount = v_initial,
      updated_at = now()
  where id = p_card_id and owner_user_id = p_owner_id;

  return jsonb_build_object(
    'card_id', p_card_id,
    'due_month', v_month,
    'current_invoice', v_current,
    'initial_future_installments_balance', v_initial,
    'native_future_commitments', v_native_future,
    'future_commitments', v_future,
    'committed_limit', v_committed,
    'free_limit', v_free,
    'available_limit', v_free
  );
end;
$$;
revoke all on function private.wallet_recalculate_card_position(uuid, uuid, date) from public, anon, authenticated, service_role;

create or replace function private.wallet_recalculate_card_position(
  p_owner_id uuid,
  p_card_id uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select private.wallet_recalculate_card_position(p_owner_id, p_card_id, date_trunc('month', current_date)::date)
$$;
revoke all on function private.wallet_recalculate_card_position(uuid, uuid) from public, anon, authenticated, service_role;

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
  if round(v_invoice + v_future, 2) > v_limit then raise exception 'Fatura atual mais compromissos futuros excedem o limite.'; end if;
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
revoke all on function public.personal_wallet_set_card_initial_balances(uuid, numeric, numeric, numeric, date, uuid) from public, anon;
grant execute on function public.personal_wallet_set_card_initial_balances(uuid, numeric, numeric, numeric, date, uuid) to authenticated;

create or replace function public.personal_wallet_reconcile_card_opening(
  p_card_id uuid,
  p_amount numeric,
  p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid(); v_card public.personal_wallet_cards%rowtype; v_key text := p_request_id::text;
begin
  if v_user is null or not public.is_platform_super_admin() or p_request_id is null or p_amount is null or p_amount <= 0 then raise exception 'Parametros de reconciliacao invalidos.'; end if;
  select * into v_card from public.personal_wallet_cards where id = p_card_id and owner_user_id = v_user for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  if v_card.opening_reconciliation_requests ? v_key then return jsonb_build_object('replayed', true, 'remaining', v_card.initial_future_installments_balance); end if;
  if p_amount > v_card.initial_future_installments_balance then raise exception 'O valor supera o futuro nao detalhado restante.'; end if;
  update public.personal_wallet_cards
  set initial_future_installments_balance = round(initial_future_installments_balance - p_amount, 2),
      opening_unallocated_amount = round(initial_future_installments_balance - p_amount, 2),
      opening_reconciliation_requests = opening_reconciliation_requests || jsonb_build_object(v_key, p_amount),
      updated_at = now()
  where id = p_card_id and owner_user_id = v_user;
  return jsonb_build_object('replayed', false, 'remaining', round(v_card.initial_future_installments_balance - p_amount, 2));
end;
$$;
revoke all on function public.personal_wallet_reconcile_card_opening(uuid, numeric, uuid) from public, anon;
grant execute on function public.personal_wallet_reconcile_card_opening(uuid, numeric, uuid) to authenticated;

commit;
