create table if not exists public.financial_operations (
  operation_id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  profile_id uuid not null references public.perfis(id),
  operator_id uuid,
  loan_id uuid not null references public.contratos(id),
  installment_id uuid not null references public.parcelas(id),
  original_operation_id uuid references public.financial_operations(operation_id),
  operation_type text not null,
  payment_method text not null,
  payment_date date not null,
  competence_date date not null,
  amount_received numeric not null default 0,
  principal_paid numeric not null default 0,
  interest_paid numeric not null default 0,
  late_fee_paid numeric not null default 0,
  principal_forgiven numeric not null default 0,
  interest_forgiven numeric not null default 0,
  late_fee_forgiven numeric not null default 0,
  amount_capitalized numeric not null default 0,
  source_id uuid references public.fontes(id),
  profit_source_id uuid references public.fontes(id),
  before_state jsonb not null,
  after_state jsonb not null,
  result jsonb not null,
  status text not null default 'COMPLETED',
  reason text,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  constraint financial_operations_idempotency_unique unique (idempotency_key),
  constraint financial_operations_status_check check (status in ('COMPLETED', 'REVERSED')),
  constraint financial_operations_amounts_check check (
    amount_received >= 0
    and principal_paid >= 0
    and interest_paid >= 0
    and late_fee_paid >= 0
    and principal_forgiven >= 0
    and interest_forgiven >= 0
    and late_fee_forgiven >= 0
    and amount_capitalized >= 0
  )
);

create index if not exists financial_operations_installment_created_idx
  on public.financial_operations(installment_id, created_at desc);

create index if not exists financial_operations_profile_created_idx
  on public.financial_operations(profile_id, created_at desc);

create index if not exists financial_operations_loan_created_idx
  on public.financial_operations(loan_id, created_at desc);

create index if not exists financial_operations_source_idx
  on public.financial_operations(source_id)
  where source_id is not null;

create index if not exists financial_operations_profit_source_idx
  on public.financial_operations(profit_source_id)
  where profit_source_id is not null;

create index if not exists financial_operations_original_idx
  on public.financial_operations(original_operation_id)
  where original_operation_id is not null;

alter table public.financial_operations enable row level security;
revoke all on public.financial_operations from public, anon, authenticated;
grant all on public.financial_operations to service_role;

create or replace function private.financial_actor_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.perfis p
  where p.user_id = (select auth.uid())
     or p.id = (select auth.uid())
  order by (p.user_id = (select auth.uid())) desc, p.created_at asc nulls last
  limit 1
$$;

revoke all on function private.financial_actor_profile_id() from public, anon, authenticated;
grant execute on function private.financial_actor_profile_id() to service_role;

create or replace function private.financial_actor_can_access(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or exists (
      select 1
      from public.perfis actor
      join public.perfis owner on owner.id = p_profile_id
      where (actor.user_id = (select auth.uid()) or actor.id = (select auth.uid()))
        and (
          actor.id = owner.id
          or actor.supervisor_id = owner.id
          or actor.owner_profile_id = owner.id
          or owner.supervisor_id = actor.id
          or coalesce(actor.owner_profile_id, actor.supervisor_id, actor.id)
             = coalesce(owner.owner_profile_id, owner.supervisor_id, owner.id)
        )
    )
$$;

revoke all on function private.financial_actor_can_access(uuid) from public, anon, authenticated;
grant execute on function private.financial_actor_can_access(uuid) to service_role;

create or replace function private.normalize_payment_method_v4(p_method text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_method text := upper(trim(coalesce(p_method, 'OTHER')));
begin
  v_method := translate(v_method, 'ÁÀÃÂÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC');
  v_method := replace(v_method, ' ', '_');

  if v_method in ('DINHEIRO', 'CASH') then return 'CASH'; end if;
  if v_method in ('TRANSFERENCIA', 'BANK_TRANSFER', 'TED', 'DOC') then return 'BANK_TRANSFER'; end if;
  if v_method in ('CARTAO', 'CREDIT_CARD', 'DEBIT_CARD') then return 'CREDIT_CARD'; end if;
  if v_method in ('PIX', 'BOLETO', 'OTHER') then return v_method; end if;

  raise exception 'Meio de pagamento nao suportado: %.', p_method;
end;
$$;

revoke all on function private.normalize_payment_method_v4(text) from public, anon, authenticated;

create or replace function public.preview_financial_operation_v4(
  p_loan_id uuid,
  p_installment_id uuid,
  p_operation_type text,
  p_amount_received numeric,
  p_payment_method text default 'OTHER',
  p_payment_date date default current_date,
  p_competence_date date default null,
  p_forgiveness_mode text default 'NONE',
  p_requested_late_fee_forgiven numeric default 0,
  p_manual_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_profile_id uuid;
  v_cycle text;
  v_contract_status text;
  v_contract_next_due_date date;
  v_source_id uuid;
  v_operation text := upper(trim(coalesce(p_operation_type, 'KEEP_PENDING')));
  v_forgiveness text := upper(trim(coalesce(p_forgiveness_mode, 'NONE')));
  v_method text;
  v_due record;
  v_due_date_before date;
  v_due_date_after date;
  v_status_before text;
  v_status_after text;
  v_paid_total_before numeric;
  v_paid_principal_before numeric;
  v_paid_interest_before numeric;
  v_paid_late_fee_before numeric;
  v_paid_date_before timestamptz;
  v_last_payment_date_before timestamptz;
  v_principal_before numeric;
  v_interest_before numeric;
  v_late_fee_before numeric;
  v_amount numeric := round(coalesce(p_amount_received, 0)::numeric, 2);
  v_remaining numeric;
  v_principal_paid numeric := 0;
  v_interest_paid numeric := 0;
  v_late_fee_paid numeric := 0;
  v_principal_forgiven numeric := 0;
  v_interest_forgiven numeric := 0;
  v_late_fee_forgiven numeric := 0;
  v_capitalized numeric := 0;
  v_principal_after numeric;
  v_interest_after numeric;
  v_late_fee_after numeric;
  v_total_before numeric;
  v_total_after numeric;
  v_competence_date date := coalesce(p_competence_date, p_payment_date, current_date);
begin
  if p_loan_id is null or p_installment_id is null then
    raise exception 'Contrato e parcela sao obrigatorios.';
  end if;

  if v_operation in ('FULL', 'CUSTOM', 'PAYMENT') then
    v_operation := 'KEEP_PENDING';
  end if;

  if v_operation not in ('KEEP_PENDING', 'RENEW_KEEP_PENDING', 'CAPITALIZE', 'SETTLE') then
    raise exception 'Operacao financeira nao suportada: %.', p_operation_type;
  end if;

  if v_amount <= 0 then
    raise exception 'O valor recebido deve ser maior que zero.';
  end if;

  if p_payment_date is null then
    raise exception 'Data do pagamento obrigatoria.';
  end if;

  if v_forgiveness not in ('NONE', 'FINE_ONLY', 'MORA_ONLY', 'FINE_AND_MORA', 'TOTAL_CHARGES', 'CAPITAL_ONLY', 'INTEREST_ONLY', 'BOTH') then
    raise exception 'Modo de perdao nao suportado: %.', p_forgiveness_mode;
  end if;

  v_method := private.normalize_payment_method_v4(p_payment_method);

  select
    coalesce(c.profile_id, c.owner_id),
    upper(coalesce(c.billing_cycle, 'MONTHLY')),
    c.status,
    c.next_due_date,
    c.source_id,
    coalesce(i.data_vencimento, i.due_date),
    coalesce(i.status, 'PENDING'),
    coalesce(i.paid_total, 0),
    coalesce(i.paid_principal, 0),
    coalesce(i.paid_interest, 0),
    coalesce(i.paid_late_fee, 0),
    i.paid_date,
    i.last_payment_date
  into
    v_profile_id, v_cycle, v_contract_status, v_contract_next_due_date, v_source_id,
    v_due_date_before, v_status_before, v_paid_total_before,
    v_paid_principal_before, v_paid_interest_before, v_paid_late_fee_before,
    v_paid_date_before, v_last_payment_date_before
  from public.contratos c
  join public.parcelas i on i.loan_id = c.id
  where c.id = p_loan_id
    and i.id = p_installment_id;

  if not found then
    raise exception 'Contrato ou parcela nao encontrado.';
  end if;

  if not private.financial_actor_can_access(v_profile_id) then
    raise exception 'Usuario sem permissao para operar este perfil.';
  end if;

  if v_source_id is null then
    raise exception 'Contrato sem fonte de capital vinculada.';
  end if;

  select * into v_due
  from public.prepare_installment_for_online_payment(
    p_loan_id,
    p_installment_id,
    p_payment_date
  );

  v_principal_before := round(greatest(coalesce(v_due.principal_due, 0), 0)::numeric, 2);
  v_interest_before := round(greatest(coalesce(v_due.interest_due, 0), 0)::numeric, 2);
  v_late_fee_before := round(greatest(coalesce(v_due.late_fee_due, 0), 0)::numeric, 2);
  v_total_before := round(v_principal_before + v_interest_before + v_late_fee_before, 2);

  if v_total_before <= 0.05 then
    raise exception 'Parcela sem saldo aberto para recebimento.';
  end if;

  if v_amount > v_total_before + 0.05 then
    raise exception 'Pagamento excedente exige decisao explicita; recebido %, saldo %.', v_amount, v_total_before;
  end if;

  v_remaining := v_amount;

  if v_forgiveness = 'CAPITAL_ONLY' then
    v_principal_paid := least(v_remaining, v_principal_before);
    v_remaining := round(v_remaining - v_principal_paid, 2);
    v_interest_forgiven := v_interest_before;
    v_late_fee_forgiven := v_late_fee_before;
  else
    v_interest_paid := least(v_remaining, v_interest_before);
    v_remaining := round(v_remaining - v_interest_paid, 2);
    v_late_fee_paid := least(v_remaining, v_late_fee_before);
    v_remaining := round(v_remaining - v_late_fee_paid, 2);
    v_principal_paid := least(v_remaining, v_principal_before);
    v_remaining := round(v_remaining - v_principal_paid, 2);

    if v_forgiveness = 'TOTAL_CHARGES' then
      v_interest_forgiven := greatest(v_interest_before - v_interest_paid, 0);
      v_late_fee_forgiven := greatest(v_late_fee_before - v_late_fee_paid, 0);
    elsif v_forgiveness in ('FINE_ONLY', 'MORA_ONLY', 'FINE_AND_MORA', 'INTEREST_ONLY', 'BOTH') then
      v_late_fee_forgiven := least(
        greatest(round(coalesce(p_requested_late_fee_forgiven, 0)::numeric, 2), 0),
        greatest(v_late_fee_before - v_late_fee_paid, 0)
      );
    end if;
  end if;

  if v_remaining > 0.05 then
    raise exception 'Valor recebido nao pode ser distribuido com seguranca. Excedente: %.', v_remaining;
  end if;

  v_principal_after := greatest(v_principal_before - v_principal_paid, 0);
  v_interest_after := greatest(v_interest_before - v_interest_paid - v_interest_forgiven, 0);
  v_late_fee_after := greatest(v_late_fee_before - v_late_fee_paid - v_late_fee_forgiven, 0);

  if v_operation = 'SETTLE' then
    v_principal_forgiven := v_principal_after;
    v_interest_forgiven := round(v_interest_forgiven + v_interest_after, 2);
    v_late_fee_forgiven := round(v_late_fee_forgiven + v_late_fee_after, 2);
    v_principal_after := 0;
    v_interest_after := 0;
    v_late_fee_after := 0;
  elsif v_operation = 'CAPITALIZE' then
    v_capitalized := round(v_interest_after + v_late_fee_after, 2);
    v_principal_after := round(v_principal_after + v_capitalized, 2);
    v_interest_after := 0;
    v_late_fee_after := 0;
  end if;

  v_total_after := round(v_principal_after + v_interest_after + v_late_fee_after, 2);
  v_due_date_after := v_due_date_before;

  if v_operation = 'RENEW_KEEP_PENDING' and v_total_after > 0.05 then
    if v_cycle not in ('MONTHLY', 'DAILY', 'GIRO', 'REVOLVING') then
      raise exception 'Avanco de ciclo nao permitido para a modalidade %.', v_cycle;
    end if;
    v_due_date_after := coalesce(p_manual_due_date, v_due_date_before + 30);
    if v_due_date_after <= v_due_date_before then
      raise exception 'O novo vencimento deve ser posterior ao vencimento atual.';
    end if;
  elsif p_manual_due_date is not null and p_manual_due_date <> v_due_date_before then
    raise exception 'Mudanca manual de vencimento exige a operacao RENEW_KEEP_PENDING.';
  end if;

  v_status_after := case when v_total_after <= 0.05 then 'PAID' else 'PARTIAL' end;

  return jsonb_build_object(
    'success', true,
    'operation_type', v_operation,
    'profile_id', v_profile_id,
    'loan_id', p_loan_id,
    'installment_id', p_installment_id,
    'source_id', v_source_id,
    'payment_method', v_method,
    'payment_date', p_payment_date,
    'competence_date', v_competence_date,
    'amount_received', v_amount,
    'principal_paid', round(v_principal_paid, 2),
    'interest_paid', round(v_interest_paid, 2),
    'late_fee_paid', round(v_late_fee_paid, 2),
    'principal_forgiven', round(v_principal_forgiven, 2),
    'interest_forgiven', round(v_interest_forgiven, 2),
    'late_fee_forgiven', round(v_late_fee_forgiven, 2),
    'amount_capitalized', round(v_capitalized, 2),
    'before', jsonb_build_object(
      'principal', v_principal_before,
      'interest', v_interest_before,
      'late_fee', v_late_fee_before,
      'total', v_total_before,
      'due_date', v_due_date_before,
      'installment_status', v_status_before,
      'contract_status', v_contract_status,
      'contract_next_due_date', v_contract_next_due_date,
      'paid_total', v_paid_total_before,
      'paid_principal', v_paid_principal_before,
      'paid_interest', v_paid_interest_before,
      'paid_late_fee', v_paid_late_fee_before,
      'paid_date', v_paid_date_before,
      'last_payment_date', v_last_payment_date_before
    ),
    'after', jsonb_build_object(
      'principal', round(v_principal_after, 2),
      'interest', round(v_interest_after, 2),
      'late_fee', round(v_late_fee_after, 2),
      'total', v_total_after,
      'due_date', v_due_date_after,
      'installment_status', v_status_after
    )
  );
end;
$$;

revoke all on function public.preview_financial_operation_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) from public, anon;
grant execute on function public.preview_financial_operation_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) to authenticated, service_role;

create or replace function public.process_financial_operation_v4(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_installment_id uuid,
  p_operation_type text,
  p_amount_received numeric,
  p_payment_method text default 'OTHER',
  p_payment_date date default current_date,
  p_competence_date date default null,
  p_forgiveness_mode text default 'NONE',
  p_requested_late_fee_forgiven numeric default 0,
  p_manual_due_date date default null,
  p_caixa_livre_id uuid default null,
  p_reason text default null,
  p_expected_preview jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_preview jsonb;
  v_existing public.financial_operations%rowtype;
  v_operation_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_operator_id uuid;
  v_source_id uuid;
  v_profit_source_id uuid;
  v_principal_paid numeric;
  v_interest_paid numeric;
  v_late_fee_paid numeric;
  v_profit_total numeric;
  v_principal_forgiven numeric;
  v_interest_forgiven numeric;
  v_late_fee_forgiven numeric;
  v_capitalized numeric;
  v_amount numeric;
  v_method text;
  v_operation text;
  v_before jsonb;
  v_after jsonb;
  v_source_before numeric;
  v_source_after numeric;
  v_profit_before numeric;
  v_profit_after numeric;
  v_contract_status_after text;
  v_result jsonb;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if p_idempotency_key is null then
    raise exception 'Chave de idempotencia obrigatoria.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select coalesce(c.profile_id, c.owner_id), c.source_id
  into v_profile_id, v_source_id
  from public.contratos c
  where c.id = p_loan_id
  for update;

  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;

  if not private.financial_actor_can_access(v_profile_id) then
    raise exception 'Usuario sem permissao para operar este perfil.';
  end if;

  select * into v_existing
  from public.financial_operations
  where profile_id = v_profile_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.loan_id <> p_loan_id
       or v_existing.installment_id <> p_installment_id
       or v_existing.amount_received <> round(coalesce(p_amount_received, 0)::numeric, 2)
       or v_existing.operation_type <> (case
            when upper(trim(coalesce(p_operation_type, 'KEEP_PENDING'))) in ('FULL', 'CUSTOM', 'PAYMENT') then 'KEEP_PENDING'
            else upper(trim(coalesce(p_operation_type, 'KEEP_PENDING')))
          end)
       or v_existing.payment_method <> private.normalize_payment_method_v4(p_payment_method)
       or v_existing.payment_date <> p_payment_date then
      raise exception 'Chave de idempotencia ja utilizada por outra operacao.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent_replay', true);
  end if;

  perform 1
  from public.parcelas
  where id = p_installment_id
    and loan_id = p_loan_id
  for update;

  if not found then
    raise exception 'Parcela nao encontrada.';
  end if;

  v_preview := public.preview_financial_operation_v4(
    p_loan_id,
    p_installment_id,
    p_operation_type,
    p_amount_received,
    p_payment_method,
    p_payment_date,
    p_competence_date,
    p_forgiveness_mode,
    p_requested_late_fee_forgiven,
    p_manual_due_date
  );

  if p_expected_preview is null then
    raise exception 'Previa autoritativa confirmada e obrigatoria.';
  end if;

  if v_preview is distinct from p_expected_preview then
    raise exception 'A posicao financeira mudou depois da previa. Gere uma nova previa antes de confirmar.';
  end if;

  v_operator_id := case when v_is_service then null else private.financial_actor_profile_id() end;
  v_operation := v_preview ->> 'operation_type';
  v_method := v_preview ->> 'payment_method';
  v_amount := (v_preview ->> 'amount_received')::numeric;
  v_principal_paid := (v_preview ->> 'principal_paid')::numeric;
  v_interest_paid := (v_preview ->> 'interest_paid')::numeric;
  v_late_fee_paid := (v_preview ->> 'late_fee_paid')::numeric;
  v_principal_forgiven := (v_preview ->> 'principal_forgiven')::numeric;
  v_interest_forgiven := (v_preview ->> 'interest_forgiven')::numeric;
  v_late_fee_forgiven := (v_preview ->> 'late_fee_forgiven')::numeric;
  v_capitalized := (v_preview ->> 'amount_capitalized')::numeric;
  v_before := v_preview -> 'before';
  v_after := v_preview -> 'after';

  if v_source_id is null then
    raise exception 'Contrato sem fonte de capital vinculada.';
  end if;

  select balance into v_source_before
  from public.fontes
  where id = v_source_id
    and profile_id = v_profile_id
  for update;

  if not found then
    raise exception 'Fonte de capital nao pertence ao perfil do contrato.';
  end if;

  v_profit_total := round(v_interest_paid + v_late_fee_paid, 2);

  if v_profit_total > 0 then
    if p_caixa_livre_id is not null then
      select id, balance into v_profit_source_id, v_profit_before
      from public.fontes
      where id = p_caixa_livre_id
        and profile_id = v_profile_id
      for update;

      if not found then
        raise exception 'Caixa Livre informado nao pertence ao perfil.';
      end if;
    else
      select id, balance into v_profit_source_id, v_profit_before
      from public.fontes
      where profile_id = v_profile_id
        and archived_at is null
        and (
          upper(coalesce(type, '')) in ('CAIXA_LIVRE', 'PROFIT', 'LUCRO')
          or lower(coalesce(name, '')) like '%caixa livre%'
          or lower(coalesce(name, '')) like '%lucro%'
        )
      order by created_at asc nulls last, id
      limit 1
      for update;
    end if;
  end if;

  update public.parcelas
  set
    principal_remaining = (v_after ->> 'principal')::numeric,
    interest_remaining = (v_after ->> 'interest')::numeric,
    late_fee_accrued = (v_after ->> 'late_fee')::numeric,
    paid_principal = round(coalesce(paid_principal, 0) + v_principal_paid, 2),
    paid_interest = round(coalesce(paid_interest, 0) + v_interest_paid, 2),
    paid_late_fee = round(coalesce(paid_late_fee, 0) + v_late_fee_paid, 2),
    paid_total = round(coalesce(paid_total, 0) + v_amount, 2),
    paid_date = case when (v_after ->> 'total')::numeric <= 0.05 then p_payment_date else paid_date end,
    last_payment_date = p_payment_date,
    status = v_after ->> 'installment_status',
    due_date = (v_after ->> 'due_date')::date,
    data_vencimento = (v_after ->> 'due_date')::date,
    logs = coalesce(logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'type', v_operation,
      'operation_id', v_operation_id,
      'idempotency_key', p_idempotency_key,
      'amount_received', v_amount,
      'payment_method', v_method,
      'operator_id', v_operator_id
    ))
  where id = p_installment_id
    and loan_id = p_loan_id;

  if v_principal_paid > 0 then
    update public.fontes
    set balance = round(coalesce(balance, 0) + v_principal_paid, 2)
    where id = v_source_id;
  end if;

  select balance into v_source_after from public.fontes where id = v_source_id;

  if v_profit_total > 0 then
    if v_profit_source_id is not null then
      update public.fontes
      set balance = round(coalesce(balance, 0) + v_profit_total, 2)
      where id = v_profit_source_id;
      select balance into v_profit_after from public.fontes where id = v_profit_source_id;
    else
      select interest_balance into v_profit_before
      from public.perfis
      where id = v_profile_id
      for update;

      update public.perfis
      set interest_balance = round(coalesce(interest_balance, 0) + v_profit_total, 2)
      where id = v_profile_id;

      select interest_balance into v_profit_after from public.perfis where id = v_profile_id;
    end if;
  end if;

  if v_principal_paid > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, v_source_id,
      coalesce(p_competence_date, p_payment_date), 'PAYMENT_RECEIVED', v_principal_paid,
      v_principal_paid, 0, 0, 'Principal recuperado pelo Payment Engine V4', 'PAGAMENTO',
      p_idempotency_key::text, v_operator_id, v_method,
      jsonb_build_object('operation_id', v_operation_id, 'operation_type', v_operation)
    );
  end if;

  if v_profit_total > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, v_profit_source_id,
      coalesce(p_competence_date, p_payment_date), 'PAYMENT_RECEIVED', v_profit_total,
      0, v_interest_paid, v_late_fee_paid, 'Lucro realizado pelo Payment Engine V4', 'LUCRO',
      p_idempotency_key::text || '_lucro', v_operator_id, v_method,
      jsonb_build_object('operation_id', v_operation_id, 'operation_type', v_operation)
    );
  end if;

  if v_principal_forgiven + v_interest_forgiven + v_late_fee_forgiven > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, coalesce(p_competence_date, p_payment_date),
      'FORGIVENESS', 0, 0, 0, 0, 'Perdao financeiro auditado pelo Payment Engine V4', 'AUDIT',
      p_idempotency_key::text || '_forgiveness', v_operator_id, v_method,
      jsonb_build_object(
        'operation_id', v_operation_id,
        'principal_forgiven', v_principal_forgiven,
        'interest_forgiven', v_interest_forgiven,
        'late_fee_forgiven', v_late_fee_forgiven,
        'reason', p_reason
      )
    );
  end if;

  if v_capitalized > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, coalesce(p_competence_date, p_payment_date),
      'CAPITALIZATION', 0, 0, 0, 0, 'Capitalizacao explicita pelo Payment Engine V4', 'AUDIT',
      p_idempotency_key::text || '_capitalization', v_operator_id, v_method,
      jsonb_build_object(
        'operation_id', v_operation_id,
        'principal_before', v_before -> 'principal',
        'interest_before', v_before -> 'interest',
        'late_fee_before', v_before -> 'late_fee',
        'capitalized_amount', v_capitalized,
        'principal_after', v_after -> 'principal',
        'reason', p_reason
      )
    );
  end if;

  if (v_before ->> 'due_date') is distinct from (v_after ->> 'due_date') then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, coalesce(p_competence_date, p_payment_date),
      'PARTIAL_RENEWAL', 0, 0, 0, 0, 'Vencimento alterado pelo Payment Engine V4', 'AUDIT',
      p_idempotency_key::text || '_renewal', v_operator_id, v_method,
      jsonb_build_object(
        'operation_id', v_operation_id,
        'old_due_date', v_before -> 'due_date',
        'new_due_date', v_after -> 'due_date',
        'reason', p_reason
      )
    );
  end if;

  insert into public.payment_transactions (
    id, installment_id, contract_id, amount, payment_method, paid_at,
    operator_profile_id, status, idempotency_key
  ) values (
    gen_random_uuid(), p_installment_id, p_loan_id, v_amount, v_method,
    p_payment_date::timestamptz, v_operator_id, 'PAID', p_idempotency_key
  );

  if not exists (
    select 1
    from public.parcelas
    where loan_id = p_loan_id
      and upper(coalesce(status, '')) not in ('RENEGOCIADO', 'CANCELADO')
      and coalesce(principal_remaining, 0) + coalesce(interest_remaining, 0) + coalesce(late_fee_accrued, 0) > 0.05
  ) then
    update public.contratos
    set status = 'PAID',
        next_due_date = null
    where id = p_loan_id;
    v_contract_status_after := 'PAID';
  else
    update public.contratos
    set
      status = case when upper(coalesce(status, '')) = 'PAID' then 'ATIVO' else status end,
      next_due_date = (
        select min(coalesce(p.data_vencimento, p.due_date))
        from public.parcelas p
        where p.loan_id = p_loan_id
          and upper(coalesce(p.status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'RENEGOCIADO', 'CANCELADO')
          and coalesce(p.principal_remaining, 0) + coalesce(p.interest_remaining, 0) + coalesce(p.late_fee_accrued, 0) > 0.05
      )
    where id = p_loan_id
    returning status into v_contract_status_after;
  end if;

  v_result := v_preview || jsonb_build_object(
    'operation_id', v_operation_id,
    'idempotency_key', p_idempotency_key,
    'operator_id', v_operator_id,
    'contract_status_after', v_contract_status_after,
    'source_balance_before', v_source_before,
    'source_balance_after', v_source_after,
    'profit_source_id', v_profit_source_id,
    'profit_balance_before', v_profit_before,
    'profit_balance_after', v_profit_after,
    'idempotent_replay', false
  );

  insert into public.financial_operations (
    operation_id, idempotency_key, profile_id, operator_id, loan_id, installment_id,
    operation_type, payment_method, payment_date, competence_date, amount_received,
    principal_paid, interest_paid, late_fee_paid, principal_forgiven,
    interest_forgiven, late_fee_forgiven, amount_capitalized, source_id,
    profit_source_id, before_state, after_state, result, reason
  ) values (
    v_operation_id, p_idempotency_key, v_profile_id, v_operator_id, p_loan_id, p_installment_id,
    v_operation, v_method, p_payment_date, coalesce(p_competence_date, p_payment_date), v_amount,
    v_principal_paid, v_interest_paid, v_late_fee_paid, v_principal_forgiven,
    v_interest_forgiven, v_late_fee_forgiven, v_capitalized, v_source_id,
    v_profit_source_id, v_before, v_after, v_result, nullif(trim(p_reason), '')
  );

  return v_result;
end;
$$;

revoke all on function public.process_financial_operation_v4(uuid, uuid, uuid, text, numeric, text, date, date, text, numeric, date, uuid, text, jsonb) from public, anon;
grant execute on function public.process_financial_operation_v4(uuid, uuid, uuid, text, numeric, text, date, date, text, numeric, date, uuid, text, jsonb) to authenticated, service_role;

create or replace function public.reverse_financial_operation_v4(
  p_original_idempotency_key uuid,
  p_reversal_idempotency_key uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_original public.financial_operations%rowtype;
  v_existing public.financial_operations%rowtype;
  v_reversal_operation_id uuid := gen_random_uuid();
  v_operator_id uuid;
  v_source_balance numeric;
  v_profit_balance numeric;
  v_result jsonb;
  v_tx record;
begin
  if p_original_idempotency_key is null or p_reversal_idempotency_key is null then
    raise exception 'Chaves da operacao original e do estorno sao obrigatorias.';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo do estorno obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_original_idempotency_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_reversal_idempotency_key::text, 0));

  select * into v_original
  from public.financial_operations
  where idempotency_key = p_original_idempotency_key
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Operacao financeira V4 nao encontrada.';
  end if;

  if not private.financial_actor_can_access(v_original.profile_id) then
    raise exception 'Usuario sem permissao para estornar esta operacao.';
  end if;

  select * into v_existing
  from public.financial_operations
  where profile_id = v_original.profile_id
    and idempotency_key = p_reversal_idempotency_key;

  if found then
    if v_existing.original_operation_id is distinct from v_original.operation_id
       or v_existing.operation_type <> 'REVERSAL' then
      raise exception 'Chave de idempotencia do estorno ja utilizada por outra operacao.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent_replay', true);
  end if;

  if v_original.status = 'REVERSED' then
    raise exception 'Operacao ja estornada.';
  end if;

  if exists (
    select 1
    from public.financial_operations later
    where later.installment_id = v_original.installment_id
      and later.created_at > v_original.created_at
      and later.status = 'COMPLETED'
      and later.operation_type <> 'REVERSAL'
  ) then
    raise exception 'Existem operacoes posteriores nesta parcela. Estorno bloqueado para preservar rastreabilidade.';
  end if;

  perform 1 from public.parcelas where id = v_original.installment_id for update;
  perform 1 from public.contratos where id = v_original.loan_id for update;

  select balance into v_source_balance
  from public.fontes
  where id = v_original.source_id
    and profile_id = v_original.profile_id
  for update;

  if coalesce(v_source_balance, 0) + 0.005 < v_original.principal_paid then
    raise exception 'Saldo da fonte insuficiente para estornar o principal recuperado.';
  end if;

  if v_original.profit_source_id is not null then
    select balance into v_profit_balance
    from public.fontes
    where id = v_original.profit_source_id
      and profile_id = v_original.profile_id
    for update;

    if coalesce(v_profit_balance, 0) + 0.005 < v_original.interest_paid + v_original.late_fee_paid then
      raise exception 'Saldo do Caixa Livre insuficiente para estornar o lucro realizado.';
    end if;
    if v_original.profit_source_id = v_original.source_id
       and coalesce(v_source_balance, 0) + 0.005 < v_original.principal_paid + v_original.interest_paid + v_original.late_fee_paid then
      raise exception 'Saldo da carteira compartilhada insuficiente para estornar capital e lucro.';
    end if;
  else
    select interest_balance into v_profit_balance
    from public.perfis
    where id = v_original.profile_id
    for update;

    if coalesce(v_profit_balance, 0) + 0.005 < v_original.interest_paid + v_original.late_fee_paid then
      raise exception 'Saldo de lucro insuficiente para estornar a operacao.';
    end if;
  end if;

  update public.parcelas
  set
    principal_remaining = (v_original.before_state ->> 'principal')::numeric,
    interest_remaining = (v_original.before_state ->> 'interest')::numeric,
    late_fee_accrued = (v_original.before_state ->> 'late_fee')::numeric,
    paid_principal = (v_original.before_state ->> 'paid_principal')::numeric,
    paid_interest = (v_original.before_state ->> 'paid_interest')::numeric,
    paid_late_fee = (v_original.before_state ->> 'paid_late_fee')::numeric,
    paid_total = (v_original.before_state ->> 'paid_total')::numeric,
    paid_date = (v_original.before_state ->> 'paid_date')::timestamptz,
    last_payment_date = (v_original.before_state ->> 'last_payment_date')::timestamptz,
    status = v_original.before_state ->> 'installment_status',
    due_date = (v_original.before_state ->> 'due_date')::date,
    data_vencimento = (v_original.before_state ->> 'due_date')::date,
    logs = coalesce(logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'type', 'REVERSAL',
      'original_operation_id', v_original.operation_id,
      'reversal_operation_id', v_reversal_operation_id,
      'reason', p_reason
    ))
  where id = v_original.installment_id;

  update public.fontes
  set balance = round(coalesce(balance, 0) - v_original.principal_paid, 2)
  where id = v_original.source_id;

  if v_original.profit_source_id is not null then
    update public.fontes
    set balance = round(coalesce(balance, 0) - v_original.interest_paid - v_original.late_fee_paid, 2)
    where id = v_original.profit_source_id;
  else
    update public.perfis
    set interest_balance = round(coalesce(interest_balance, 0) - v_original.interest_paid - v_original.late_fee_paid, 2)
    where id = v_original.profile_id;
  end if;

  update public.contratos
  set
    status = coalesce(v_original.before_state ->> 'contract_status', status),
    next_due_date = (v_original.before_state ->> 'contract_next_due_date')::date
  where id = v_original.loan_id;

  for v_tx in
    select *
    from public.transacoes
    where profile_id = v_original.profile_id
      and coalesce(meta ->> 'operation_id', '') = v_original.operation_id::text
      and category in ('PAGAMENTO', 'LUCRO')
    order by created_at, id
  loop
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, original_tx_id, reversed_of_transaction_id,
      payment_type, meta
    ) values (
      gen_random_uuid(), v_tx.profile_id, v_tx.loan_id, v_tx.installment_id, v_tx.source_id,
      now(), 'REVERSAL', -coalesce(v_tx.amount, 0),
      -coalesce(v_tx.principal_delta, 0), -coalesce(v_tx.interest_delta, 0),
      -coalesce(v_tx.late_fee_delta, 0), 'Estorno vinculado ao Payment Engine V4', 'ESTORNO',
      p_reversal_idempotency_key::text || '_' || left(v_tx.id::text, 8),
      private.financial_actor_profile_id(), v_tx.id, v_tx.id, v_tx.payment_type,
      jsonb_build_object(
        'operation_id', v_reversal_operation_id,
        'original_operation_id', v_original.operation_id,
        'reversal_of_idempotency_key', p_original_idempotency_key,
        'reason', p_reason
      )
    );
  end loop;

  update public.payment_transactions
  set status = 'REVERSED'
  where idempotency_key = p_original_idempotency_key
    and contract_id = v_original.loan_id;

  v_operator_id := private.financial_actor_profile_id();
  v_result := jsonb_build_object(
    'success', true,
    'operation_id', v_reversal_operation_id,
    'original_operation_id', v_original.operation_id,
    'idempotency_key', p_reversal_idempotency_key,
    'amount_reversed', v_original.amount_received,
    'principal_reversed', v_original.principal_paid,
    'interest_reversed', v_original.interest_paid,
    'late_fee_reversed', v_original.late_fee_paid,
    'idempotent_replay', false
  );

  update public.financial_operations
  set status = 'REVERSED', reversed_at = now(), reversed_by = v_operator_id
  where operation_id = v_original.operation_id;

  insert into public.financial_operations (
    operation_id, idempotency_key, profile_id, operator_id, loan_id, installment_id,
    original_operation_id, operation_type, payment_method, payment_date,
    competence_date, amount_received, principal_paid, interest_paid, late_fee_paid,
    principal_forgiven, interest_forgiven, late_fee_forgiven, amount_capitalized,
    source_id, profit_source_id, before_state, after_state, result, reason
  ) values (
    v_reversal_operation_id, p_reversal_idempotency_key, v_original.profile_id,
    v_operator_id, v_original.loan_id, v_original.installment_id,
    v_original.operation_id, 'REVERSAL', v_original.payment_method, current_date,
    current_date, 0, 0, 0, 0, 0, 0, 0, 0,
    v_original.source_id, v_original.profit_source_id,
    v_original.after_state, v_original.before_state, v_result, trim(p_reason)
  );

  return v_result;
end;
$$;

revoke all on function public.reverse_financial_operation_v4(uuid, uuid, text) from public, anon;
grant execute on function public.reverse_financial_operation_v4(uuid, uuid, text) to authenticated, service_role;

revoke execute on function public.process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid) from authenticated;
revoke execute on function public.process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid) from authenticated;

comment on table public.financial_operations is
'Registro imutavel das operacoes do Payment Engine V4, com snapshots para auditoria e estorno.';

comment on function public.preview_financial_operation_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) is
'Previa autoritativa de recebimento. Usa o mesmo calculo consumido pela execucao V4.';

comment on function public.process_financial_operation_v4(uuid, uuid, uuid, text, numeric, text, date, date, text, numeric, date, uuid, text, jsonb) is
'Executa recebimento manual de forma atomica, idempotente, auditavel e com isolamento por perfil.';

notify pgrst, 'reload schema';
;
