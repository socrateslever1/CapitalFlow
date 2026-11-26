-- Fase 2 de docs/PLANO_CARTEIRA_PARIDADE.md: ferramentas.
--
-- 2.1 "Considerar no limite do cartão?": personal_wallet_expenses.affects_limit
--     (padrão true). Um lançamento marcado como false continua somando na
--     fatura, mas sai do limite comprometido. Muda só pelo seletor
--     personal_wallet_set_expense_affects_limit.
-- 2.2 Reabrir fatura paga: personal_wallet_reopen_invoice estorna os pagamentos
--     da fatura sem apagar nada. Devolve o valor às contas de origem com um
--     lançamento de estorno, marca o pagamento original como estornado
--     (reversed_at) e volta as parcelas do mês a pendente.
--
-- Padrões reproduzem o comportamento atual. Nenhum lançamento, pagamento ou
-- saldo existente é alterado por esta migration.

begin;

alter table public.personal_wallet_expenses
  add column if not exists affects_limit boolean not null default true;
alter table public.personal_wallet_invoice_payments
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_request_id uuid;
create index if not exists wallet_invoice_payments_reversal_request_idx
  on public.personal_wallet_invoice_payments (owner_user_id, reversal_request_id)
  where reversal_request_id is not null;

-- Posição do cartão: idêntica à anterior, menos os lançamentos fora do limite.
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
  v_outside_limit numeric(14,2) := 0;
begin
  v_month := date_trunc('month', coalesce(p_competence_month, current_date))::date;
  select credit_limit, coalesce(initial_future_installments_balance, 0) into v_limit, v_initial
  from public.personal_wallet_cards where id=p_card_id and owner_user_id=p_owner_id for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  v_current := private.wallet_effective_cycle_amount(p_owner_id,p_card_id,v_month);
  select coalesce(round(sum(private.wallet_effective_cycle_amount(p_owner_id,p_card_id,m.due_month)),2),0) into v_native_future
  from (select distinct i.due_month from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id where e.owner_user_id=p_owner_id and e.card_id=p_card_id and e.status<>'CANCELED' and i.status<>'CANCELED' and i.due_month>v_month) m;
  v_future:=round(v_initial+v_native_future,2);
  -- Lançamentos marcados para não consumir limite continuam na fatura, mas saem do limite comprometido.
  select coalesce(round(sum(greatest(0, i.amount - coalesce(i.paid_amount, 0))), 2), 0) into v_outside_limit
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id = i.expense_id
  where e.owner_user_id = p_owner_id and e.card_id = p_card_id and e.status <> 'CANCELED'
    and i.status = 'PENDING' and i.due_month >= v_month
    and not e.affects_limit and not coalesce(e.is_invoice_credit, false) and e.entry_type = 'PURCHASE'
    -- Só o que entrou de fato no ciclo: meses consolidados por valor fechado e
    -- compras absorvidas por uma consolidação de abertura não são subtraídos.
    and i.opening_invoice_id is null
    and not exists(select 1 from public.personal_wallet_expenses o
      where o.owner_user_id = p_owner_id and o.card_id = p_card_id and o.entry_type = 'INVOICE_OVERRIDE'
        and o.status <> 'CANCELED' and o.invoice_due_month = i.due_month and not o.is_opening_summary);
  v_committed:=greatest(0, round(v_current+v_future-v_outside_limit,2));
  v_free:=case when coalesce(v_limit,0)-v_committed<0 then 0 else round(coalesce(v_limit,0)-v_committed,2) end;
  update public.personal_wallet_cards set current_bill=v_current,used_limit=v_committed,opening_unallocated_amount=v_initial,updated_at=now() where id=p_card_id and owner_user_id=p_owner_id;
  return jsonb_build_object('card_id',p_card_id,'due_month',v_month,'current_invoice',v_current,'initial_future_installments_balance',v_initial,'native_future_commitments',v_native_future,'future_commitments',v_future,'committed_limit',v_committed,'outside_limit',v_outside_limit,'free_limit',v_free,'available_limit',v_free);
end;
$$;

-- Pagamento estornado não conta como fatura paga no roteamento nem na antecipação.
create or replace function private.wallet_card_first_due_date(
  p_card_id uuid,
  p_expense_date date,
  p_explicit_due_date date default null
) returns date
language plpgsql stable security definer
set search_path to public, pg_temp
as $$
declare
  v_card public.personal_wallet_cards%rowtype;
  v_today date := (now() at time zone 'America/Manaus')::date;
  v_min_month date;
  v_purchase_month date;
  v_open_month date;
  v_result_month date;
begin
  if p_card_id is null then
    return coalesce(p_explicit_due_date, p_expense_date);
  end if;
  if p_expense_date is null then
    raise exception 'Data da compra obrigatória';
  end if;

  select * into v_card
  from public.personal_wallet_cards
  where id = p_card_id and owner_user_id = auth.uid();
  if not found then raise exception 'Cartão não encontrado para o usuário'; end if;

  v_min_month := case
    when v_card.opening_invoice_month is null then null
    when v_card.opening_invoice_state = 'CLOSED'
      then (date_trunc('month', v_card.opening_invoice_month) + interval '1 month')::date
    else date_trunc('month', v_card.opening_invoice_month)::date end;

  v_purchase_month := private.wallet_card_cycle_month_for_date(v_card, p_expense_date);
  v_open_month := private.wallet_card_cycle_month_for_date(v_card, v_today);

  v_result_month := v_purchase_month;
  -- Fatura da compra já fechada: só a recebe se ainda não venceu nem foi paga.
  if v_purchase_month < v_open_month and (
    (private.wallet_card_cycle_dates(v_card, v_purchase_month)).due_date < v_today
    or exists (select 1 from public.personal_wallet_invoice_payments p
      where p.card_id = p_card_id and p.owner_user_id = v_card.owner_user_id
        and date_trunc('month', p.due_month) = v_purchase_month and p.reversed_at is null)
    or exists (select 1 from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id = i.expense_id
      where e.card_id = p_card_id and e.owner_user_id = v_card.owner_user_id
        and e.status <> 'CANCELED' and i.status <> 'CANCELED'
        and date_trunc('month', coalesce(e.invoice_due_month, i.due_month)) = v_purchase_month
        and (i.status = 'PAID' or coalesce(i.paid_amount, 0) > 0))
  ) then
    v_result_month := v_open_month;
  end if;

  if v_min_month is not null and v_result_month < v_min_month then
    v_result_month := v_min_month;
  end if;

  if p_explicit_due_date is not null then
    if v_min_month is not null and date_trunc('month', p_explicit_due_date)::date < v_min_month then
      return private.wallet_card_due_in_month(v_card, v_min_month);
    end if;
    if p_expense_date < v_today and date_trunc('month', p_explicit_due_date)::date < v_result_month then
      return v_result_month;
    end if;
    return p_explicit_due_date;
  end if;

  return private.wallet_card_due_in_month(v_card, v_result_month);
end;
$$;

create or replace function public.personal_wallet_advance_installments(
  p_expense_id uuid,
  p_target_due_month date,
  p_count integer,
  p_discount numeric,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_target date := date_trunc('month', p_target_due_month)::date;
  v_discount numeric(14,2) := round(coalesce(p_discount, 0), 2);
  v_expense public.personal_wallet_expenses%rowtype;
  v_payload jsonb;
  v_ids uuid[];
  v_advanced numeric(14,2);
  v_moved integer;
  v_position jsonb;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_expense_id is null or p_target_due_month is null or p_request_id is null then
    raise exception 'Parametros obrigatorios ausentes.';
  end if;
  if coalesce(p_count, 0) not between 1 and 120 then
    raise exception 'Quantidade de parcelas invalida.';
  end if;
  if p_discount is not null and (p_discount < 0 or p_discount <> v_discount) then
    raise exception 'Informe um desconto valido com ate duas casas decimais.';
  end if;
  v_payload := jsonb_build_object('operation', 'ADVANCE_INSTALLMENTS', 'expense_id', p_expense_id,
    'target_due_month', v_target, 'count', p_count, 'discount', v_discount);

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':expense:' || p_expense_id::text, 0));
  select * into v_expense from public.personal_wallet_expenses
    where id = p_expense_id and owner_user_id = v_user for update;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;

  if v_expense.mutation_requests ? p_request_id::text then
    if v_expense.mutation_requests -> p_request_id::text <> v_payload then
      raise exception 'Chave de requisicao reutilizada com dados diferentes.';
    end if;
    return private.wallet_recalculate_card_position(v_user, v_expense.card_id) || jsonb_build_object('replayed', true);
  end if;
  if exists(select 1 from public.personal_wallet_expenses e
    where e.owner_user_id = v_user and e.id <> p_expense_id and e.mutation_requests ? p_request_id::text) then
    raise exception 'Chave de requisicao ja utilizada em outro lancamento.';
  end if;
  if v_expense.card_id is null or v_expense.entry_type <> 'PURCHASE'
     or v_expense.status <> 'PENDING' or coalesce(v_expense.is_invoice_credit, false) then
    raise exception 'Somente compras pendentes no cartao podem ser antecipadas.';
  end if;
  perform 1 from public.personal_wallet_cards
    where id = v_expense.card_id and owner_user_id = v_user and status = 'ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;

  -- Antecipar é trazer para a fatura atual ou uma futura, nunca para uma competência passada.
  if v_target < date_trunc('month', (now() at time zone 'America/Manaus')::date)::date then
    raise exception 'Antecipe para a fatura em aberto, nao para uma fatura passada.';
  end if;
  -- Fatura consolidada por valor fechado não soma lançamentos individuais.
  if exists(select 1 from public.personal_wallet_expenses o
      where o.owner_user_id = v_user and o.card_id = v_expense.card_id
        and o.entry_type = 'INVOICE_OVERRIDE' and o.status <> 'CANCELED'
        and o.invoice_due_month = v_target and not o.is_opening_summary) then
    raise exception 'Esta fatura foi consolidada por valor fechado. Ajuste a fatura em vez de antecipar.';
  end if;
  -- Fatura de destino já quitada não é reaberta por antecipação.
  if exists(select 1 from public.personal_wallet_invoice_payments p
      where p.owner_user_id = v_user and p.card_id = v_expense.card_id and p.due_month = v_target and p.reversed_at is null)
     and private.wallet_effective_cycle_amount(v_user, v_expense.card_id, v_target) = 0 then
    raise exception 'Esta fatura ja foi paga. Antecipe para a fatura em aberto.';
  end if;

  select array_agg(id order by due_month, installment_number), coalesce(sum(amount), 0)
    into v_ids, v_advanced
  from (
    select i.id, i.due_month, i.installment_number, i.amount
    from public.personal_wallet_expense_installments i
    where i.expense_id = p_expense_id and i.owner_user_id = v_user
      and i.status = 'PENDING' and coalesce(i.paid_amount, 0) = 0
      and i.due_month > v_target
    order by i.due_month, i.installment_number
    limit p_count
    for update
  ) chosen;
  v_moved := coalesce(array_length(v_ids, 1), 0);
  if v_moved = 0 then raise exception 'Nao ha parcelas futuras para antecipar.'; end if;
  if v_moved <> p_count then
    raise exception 'Existem apenas % parcelas futuras para antecipar.', v_moved;
  end if;
  if v_discount >= v_advanced then
    raise exception 'O desconto precisa ser menor que o valor antecipado.';
  end if;

  update public.personal_wallet_expense_installments
    set due_month = v_target
    where id = any(v_ids);

  if v_discount > 0 then
    perform public.personal_wallet_create_invoice_credit(
      v_expense.card_id, v_target, v_discount,
      left('Desconto por antecipação · ' || v_expense.description, 240),
      (now() at time zone 'America/Manaus')::date,
      'Desconto concedido pelo banco na antecipação de ' || v_moved || ' parcela(s).',
      md5(p_request_id::text || ':advance-discount')::uuid
    );
  end if;

  update public.personal_wallet_expenses
    set mutation_requests = mutation_requests || jsonb_build_object(p_request_id::text, v_payload),
        updated_at = now()
    where id = p_expense_id;

  v_position := private.wallet_recalculate_card_position(v_user, v_expense.card_id);
  return v_position || jsonb_build_object('replayed', false, 'advanced_count', v_moved,
    'advanced_amount', v_advanced, 'discount', v_discount);
end;
$$;

-- 2.1: marca um lançamento como dentro ou fora do limite.
create or replace function public.personal_wallet_set_expense_affects_limit(
  p_expense_id uuid,
  p_affects_limit boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_expense_id is null or p_affects_limit is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':expense:' || p_expense_id::text, 0));
  select * into v_expense from public.personal_wallet_expenses
    where id = p_expense_id and owner_user_id = v_user for update;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;
  if v_expense.card_id is null or v_expense.entry_type <> 'PURCHASE' or coalesce(v_expense.is_invoice_credit, false) then
    raise exception 'So compras no cartao podem ficar fora do limite.';
  end if;
  update public.personal_wallet_expenses set affects_limit = p_affects_limit, updated_at = now()
    where id = p_expense_id;
  return private.wallet_recalculate_card_position(v_user, v_expense.card_id);
end;
$$;

-- 2.2: reabre uma fatura paga, estornando os pagamentos sem apagar registros.
create or replace function public.personal_wallet_reopen_invoice(
  p_card_id uuid,
  p_due_month date,
  p_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_month date := date_trunc('month', p_due_month)::date;
  v_card_name text;
  v_payment record;
  v_original_op uuid;
  v_reversal_op uuid;
  v_count integer := 0;
  v_total numeric(14,2) := 0;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_card_id is null or p_due_month is null or p_request_id is null then
    raise exception 'Parametros obrigatorios ausentes.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':invoice-payment:' || p_card_id::text, 0));
  select nickname into v_card_name from public.personal_wallet_cards
    where id = p_card_id and owner_user_id = v_user for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;

  -- Repetição da mesma requisição.
  if exists(select 1 from public.personal_wallet_invoice_payments
      where owner_user_id = v_user and reversal_request_id = p_request_id
        and (card_id <> p_card_id or due_month <> v_month)) then
    raise exception 'Chave de requisicao ja utilizada em outra fatura.';
  end if;
  if exists(select 1 from public.personal_wallet_invoice_payments
      where owner_user_id = v_user and reversal_request_id = p_request_id) then
    return private.wallet_recalculate_card_position(v_user, p_card_id) || jsonb_build_object('replayed', true);
  end if;

  -- Restante levado para outra fatura: desfazer primeiro aquele lançamento.
  if exists(select 1 from public.personal_wallet_expenses e, jsonb_each(e.mutation_requests) r
      where e.owner_user_id = v_user and e.card_id = p_card_id and e.status <> 'CANCELED'
        and r.value->>'operation' = 'ROLL_INVOICE_REMAINDER'
        and (r.value->>'due_month')::date = v_month) then
    raise exception 'O restante desta fatura foi levado para outra fatura. Exclua aquele lancamento antes de reabrir.';
  end if;

  for v_payment in
    select * from public.personal_wallet_invoice_payments
    where owner_user_id = v_user and card_id = p_card_id and due_month = v_month and reversed_at is null
    order by created_at, id
    for update
  loop
    if v_payment.account_id is not null then
      update public.personal_wallet_accounts set balance = round(balance + v_payment.amount, 2), updated_at = now()
        where id = v_payment.account_id and owner_user_id = v_user;
      if not found then raise exception 'Conta de origem do pagamento nao encontrada.'; end if;
      select id into v_original_op from public.personal_wallet_account_operations
        where owner_user_id = v_user and request_id = v_payment.request_id and operation_type = 'PAYMENT'
        limit 1;
      insert into public.personal_wallet_account_operations(
        owner_user_id, request_id, operation_type, from_account_id, to_account_id, amount,
        description, category, operation_date, occurred_at, voided_at, voids_operation_id
      ) values (
        v_user, md5(p_request_id::text || ':' || v_payment.id::text)::uuid, 'INCOME', null, v_payment.account_id,
        v_payment.amount,
        left('Estorno: pagamento de fatura - ' || coalesce(v_card_name, 'Cartao') || ' - ' || to_char(v_month, 'MM/YYYY'), 240),
        'Estorno de lançamento', (now() at time zone 'America/Manaus')::date, now(),
        now(), v_original_op
      ) returning id into v_reversal_op;
      if v_original_op is not null then
        update public.personal_wallet_account_operations set voided_at = now()
          where id = v_original_op and owner_user_id = v_user and voided_at is null;
      end if;
    end if;
    update public.personal_wallet_invoice_payments
      set reversed_at = now(), reversal_request_id = p_request_id
      where id = v_payment.id;
    v_count := v_count + 1;
    v_total := round(v_total + v_payment.amount, 2);
  end loop;
  if v_count = 0 then raise exception 'Esta fatura nao tem pagamento para desfazer.'; end if;

  -- As parcelas do mês voltam a pendente (os pagamentos só alocam parcelas deste mês).
  update public.personal_wallet_expense_installments i
    set paid_amount = 0, status = 'PENDING'
  from public.personal_wallet_expenses e
  where e.id = i.expense_id and e.owner_user_id = v_user and e.card_id = p_card_id
    and i.owner_user_id = v_user and i.due_month = v_month and i.status <> 'CANCELED'
    and e.status <> 'CANCELED';
  update public.personal_wallet_expenses e set status = 'PENDING', updated_at = now()
  where e.owner_user_id = v_user and e.card_id = p_card_id and e.status = 'PAID'
    and exists(select 1 from public.personal_wallet_expense_installments i
      where i.expense_id = e.id and i.status = 'PENDING');

  return private.wallet_recalculate_card_position(v_user, p_card_id)
    || jsonb_build_object('replayed', false, 'reversed_payments', v_count, 'reversed_amount', v_total);
end;
$$;

revoke all on function public.personal_wallet_set_expense_affects_limit(uuid, boolean) from public, anon;
grant execute on function public.personal_wallet_set_expense_affects_limit(uuid, boolean) to authenticated;
revoke all on function public.personal_wallet_reopen_invoice(uuid, date, uuid) from public, anon;
grant execute on function public.personal_wallet_reopen_invoice(uuid, date, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
