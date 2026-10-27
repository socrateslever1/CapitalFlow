-- CapitalFlow Wallet V9: Carga Inicial de Cartão em Uso (initial_future_installments_balance)
-- e suporte a Conta de Pagamento (PAYMENT) mantendo isolamento estrito e idempotência.

begin;

-- 1. Suporte ao tipo de conta 'PAYMENT' (Conta de Pagamento) além dos tipos canônicos existentes
alter table public.personal_wallet_accounts
  drop constraint if exists personal_wallet_accounts_account_type_check;

alter table public.personal_wallet_accounts
  add constraint personal_wallet_accounts_account_type_check
    check (account_type in ('CHECKING', 'PAYMENT', 'SAVINGS', 'CASH', 'INVESTMENT'));

-- 2. Extensão aditiva em personal_wallet_cards para Carga Inicial de Cartão em Uso
alter table public.personal_wallet_cards
  add column if not exists initial_future_installments_balance numeric(14,2) not null default 0.00,
  add column if not exists initial_balance_occurred_at timestamptz null,
  add column if not exists initial_balance_requests jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_wallet_cards_initial_future_nonnegative'
      and conrelid = 'public.personal_wallet_cards'::regclass
  ) then
    alter table public.personal_wallet_cards
      add constraint personal_wallet_cards_initial_future_nonnegative
      check (initial_future_installments_balance >= 0);
  end if;
end $$;

create index if not exists idx_wallet_cards_initial_balance_requests
  on public.personal_wallet_cards using gin(initial_balance_requests)
  where initial_balance_requests <> '{}'::jsonb;

-- Sincroniza valores existentes de opening_unallocated_amount caso já preenchidos
update public.personal_wallet_cards
set initial_future_installments_balance = coalesce(opening_unallocated_amount, 0),
    initial_balance_occurred_at = coalesce(initial_balance_occurred_at, updated_at, created_at)
where initial_future_installments_balance = 0
  and coalesce(opening_unallocated_amount, 0) > 0;

-- 3. Atualiza função interna de recálculo de posição de crédito do cartão
-- Fórmula canônica:
-- Limite Livre = credit_limit - (fatura_do_mes_atual + initial_future_installments_balance + soma_parcelas_futuras_nativas)
create or replace function private.wallet_recalculate_card_position(
  p_owner_id uuid,
  p_card_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_credit_limit numeric(14,2);
  v_initial_future numeric(14,2) := 0;
  v_current_month date;
  v_current numeric(14,2) := 0;
  v_native_future numeric(14,2) := 0;
  v_future numeric(14,2) := 0;
  v_committed numeric(14,2) := 0;
  v_free numeric(14,2) := 0;
begin
  select credit_limit,
         greatest(coalesce(initial_future_installments_balance, 0), coalesce(opening_unallocated_amount, 0))
  into v_credit_limit, v_initial_future
  from public.personal_wallet_cards
  where id = p_card_id and owner_user_id = p_owner_id
  for update;

  if not found then
    raise exception 'Cartao nao encontrado.';
  end if;

  with candidate_months as (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.owner_user_id = p_owner_id
      and e.card_id = p_card_id
      and e.status <> 'CANCELED'
      and i.status <> 'CANCELED'
  ), effective as (
    select due_month, private.wallet_effective_cycle_amount(p_owner_id, p_card_id, due_month) as amount
    from candidate_months
  )
  select min(due_month) into v_current_month
  from effective
  where amount > 0;

  if v_current_month is not null then
    v_current := private.wallet_effective_cycle_amount(p_owner_id, p_card_id, v_current_month);

    with candidate_months as (
      select distinct i.due_month
      from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id = i.expense_id
      where e.owner_user_id = p_owner_id
        and e.card_id = p_card_id
        and e.status <> 'CANCELED'
        and i.status <> 'CANCELED'
        and i.due_month > v_current_month
    )
    select coalesce(round(sum(private.wallet_effective_cycle_amount(p_owner_id, p_card_id, due_month)), 2), 0)
    into v_native_future
    from candidate_months;
  end if;

  v_future := round(v_native_future + v_initial_future, 2);
  v_committed := round(v_current + v_future, 2);
  v_free := greatest(0, round(v_credit_limit - v_committed, 2));

  update public.personal_wallet_cards
  set current_bill = v_current,
      used_limit = v_committed,
      initial_future_installments_balance = v_initial_future,
      opening_unallocated_amount = v_initial_future,
      updated_at = now()
  where id = p_card_id and owner_user_id = p_owner_id;

  return jsonb_build_object(
    'card_id', p_card_id,
    'due_month', v_current_month,
    'current_invoice', v_current,
    'initial_future_installments_balance', v_initial_future,
    'native_future_commitments', v_native_future,
    'future_commitments', v_future,
    'committed_limit', v_committed,
    'free_limit', v_free,
    'available_limit', v_free
  );
end;
$$;

revoke all on function private.wallet_recalculate_card_position(uuid, uuid)
  from public, anon, authenticated, service_role;

-- 4. Mantém o trigger de atualização do cartão alinhado com initial_future_installments_balance
create or replace function private.wallet_preserve_partial_bill_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_month date;
  v_initial numeric(14,2) := greatest(
    coalesce(new.initial_future_installments_balance, 0),
    coalesce(new.opening_unallocated_amount, 0)
  );
  v_future numeric(14,2) := v_initial;
begin
  new.initial_future_installments_balance := v_initial;
  new.opening_unallocated_amount := v_initial;

  with candidate_months as (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.card_id = new.id
      and e.owner_user_id = new.owner_user_id
      and e.status <> 'CANCELED'
      and i.status <> 'CANCELED'
  ), effective as (
    select due_month, private.wallet_effective_cycle_amount(new.owner_user_id, new.id, due_month) as amount
    from candidate_months
  )
  select min(due_month) into v_month
  from effective
  where amount > 0;

  new.current_bill := case
    when v_month is null then 0
    else private.wallet_effective_cycle_amount(new.owner_user_id, new.id, v_month)
  end;

  with candidate_months as (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.card_id = new.id
      and e.owner_user_id = new.owner_user_id
      and e.status <> 'CANCELED'
      and i.status <> 'CANCELED'
      and (v_month is null or i.due_month > v_month)
  )
  select v_future + coalesce(round(sum(private.wallet_effective_cycle_amount(new.owner_user_id, new.id, due_month)), 2), 0)
  into v_future
  from candidate_months;

  new.used_limit := round(new.current_bill + v_future, 2);
  return new;
end;
$fn$;

-- 5. RPC Canônica: personal_wallet_set_card_initial_balances
-- Configura/ajusta de forma atômica e idempotente o Limite Total, a Fatura Atual e os Compromissos Futuros Preexistentes
create or replace function public.personal_wallet_set_card_initial_balances(
  p_card_id uuid,
  p_credit_limit numeric,
  p_current_invoice numeric,
  p_future_commitments numeric,
  p_due_month date,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_card public.personal_wallet_cards%rowtype;
  v_month date := date_trunc('month', coalesce(p_due_month, current_date))::date;
  v_limit numeric(14,2);
  v_invoice numeric(14,2);
  v_future numeric(14,2);
  v_payload jsonb;
  v_position jsonb;
  v_override_req uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado a Carteira.';
  end if;

  if p_card_id is null or p_request_id is null then
    raise exception 'Identificador do cartao e chave de requisicao sao obrigatorios.';
  end if;

  if p_credit_limit is null or p_credit_limit < 0 or p_credit_limit <> round(p_credit_limit, 2) then
    raise exception 'Informe um limite total valido com ate duas casas decimais.';
  end if;

  if p_current_invoice is null or p_current_invoice < 0 or p_current_invoice <> round(p_current_invoice, 2) then
    raise exception 'Informe um valor de fatura atual valido (positivo ou zero).';
  end if;

  if p_future_commitments is null or p_future_commitments < 0 or p_future_commitments <> round(p_future_commitments, 2) then
    raise exception 'Informe um saldo de compromissos futuros valido (positivo ou zero).';
  end if;

  v_limit := round(p_credit_limit, 2);
  v_invoice := round(p_current_invoice, 2);
  v_future := round(p_future_commitments, 2);

  if round(v_invoice + v_future, 2) > v_limit then
    raise exception 'A soma da fatura atual com os compromissos futuros excede o limite total do cartao.';
  end if;

  v_payload := jsonb_build_object(
    'credit_limit', v_limit,
    'current_invoice', v_invoice,
    'future_commitments', v_future,
    'due_month', v_month
  );

  perform pg_advisory_xact_lock(hashtextextended(
    v_user::text || ':card-initial-balances:' || p_card_id::text, 0
  ));

  select * into v_card
  from public.personal_wallet_cards
  where id = p_card_id and owner_user_id = v_user and status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'Cartao ativo nao encontrado ou acesso nao autorizado.';
  end if;

  -- Idempotência estrita por p_request_id
  if v_card.initial_balance_requests ? p_request_id::text then
    if coalesce(v_card.initial_balance_requests -> p_request_id::text, 'null'::jsonb) <> v_payload then
      raise exception 'Chave de requisicao reutilizada com parametros diferentes.';
    end if;
    v_position := private.wallet_recalculate_card_position(v_user, p_card_id);
    return v_position || jsonb_build_object('replayed', true);
  end if;

  -- Atualiza os saldos de abertura no cartão
  update public.personal_wallet_cards
  set credit_limit = v_limit,
      initial_future_installments_balance = v_future,
      opening_unallocated_amount = v_future,
      initial_balance_occurred_at = coalesce(initial_balance_occurred_at, now()),
      initial_balance_requests = initial_balance_requests || jsonb_build_object(p_request_id::text, v_payload),
      updated_at = now()
  where id = p_card_id and owner_user_id = v_user;

  -- Se houver fatura atual informada (> 0), aplica override consolidado no mês de competência
  if v_invoice > 0 then
    v_override_req := md5('card_initial_invoice:' || p_request_id::text)::uuid;
    perform public.personal_wallet_set_monthly_invoice_override(
      p_card_id,
      v_month,
      v_invoice,
      v_override_req
    );
  end if;

  v_position := private.wallet_recalculate_card_position(v_user, p_card_id);
  return v_position || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.personal_wallet_set_card_initial_balances(uuid, numeric, numeric, numeric, date, uuid)
  from public, anon;
grant execute on function public.personal_wallet_set_card_initial_balances(uuid, numeric, numeric, numeric, date, uuid)
  to authenticated;

commit;
