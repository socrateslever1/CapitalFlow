-- Operações de cartão com várias escritas viram uma única transação no servidor.
--
-- Antes, a tela compunha estas operações com chamadas separadas:
--   * restante da fatura: quitava o restante e depois lançava na próxima fatura
--     (e mandava um request_id inválido, então a segunda etapa sempre falhava);
--   * antecipação de parcelas: cancelava a compra e recriava até três lançamentos;
--   * exclusão de parcelas: cancelava a compra e recriava as parcelas mantidas.
-- Uma falha no meio deixava o dado pela metade, e repetir duplicava lançamentos.
--
-- Agora cada operação é uma RPC transacional e idempotente (request_id):
--   1. personal_wallet_roll_invoice_remainder
--   2. personal_wallet_advance_installments  (move parcelas, preserva numeração)
--   3. personal_wallet_cancel_installments   (cancela parcelas, preserva as demais)
-- Somente funções novas. Nenhum dado existente é alterado por esta migration.

begin;

-- 1. Restante da fatura levado à próxima fatura (ou parcelado), numa só transação.
create or replace function public.personal_wallet_roll_invoice_remainder(
  p_card_id uuid,
  p_due_month date,
  p_mode text,
  p_next_due_month date,
  p_expected_remainder numeric,
  p_installment_count integer,
  p_total_amount numeric,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_month date := date_trunc('month', p_due_month)::date;
  v_next date := date_trunc('month', p_next_due_month)::date;
  v_mode text := upper(coalesce(p_mode, ''));
  v_existing public.personal_wallet_expenses%rowtype;
  v_remaining numeric(14,2);
  v_amount numeric(14,2);
  v_count integer;
  v_expense_id uuid;
  v_label text;
  v_payload jsonb;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_card_id is null or p_due_month is null or p_next_due_month is null or p_request_id is null then
    raise exception 'Parametros obrigatorios ausentes.';
  end if;
  if v_mode not in ('ROLL_TO_NEXT', 'INSTALLMENT_PLAN') then
    raise exception 'Escolha levar o restante para a proxima fatura ou parcelar.';
  end if;
  if v_next <= v_month then
    raise exception 'A fatura de destino precisa ser posterior a fatura paga.';
  end if;
  if p_expected_remainder is null or p_expected_remainder <= 0
     or p_expected_remainder <> round(p_expected_remainder, 2) then
    raise exception 'Informe o saldo restante com ate duas casas decimais.';
  end if;

  v_payload := jsonb_build_object('operation', 'ROLL_INVOICE_REMAINDER', 'card_id', p_card_id,
    'due_month', v_month, 'mode', v_mode, 'next_due_month', v_next,
    'expected_remainder', round(p_expected_remainder, 2),
    'installment_count', p_installment_count, 'total_amount', round(coalesce(p_total_amount, 0), 2));

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':invoice-payment:' || p_card_id::text, 0));
  perform 1 from public.personal_wallet_cards
    where id = p_card_id and owner_user_id = v_user and status = 'ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;

  -- Repetição da mesma requisição: devolve o lançamento já criado, se os dados forem os mesmos.
  select * into v_existing from public.personal_wallet_expenses
    where owner_user_id = v_user and request_id = p_request_id;
  if found then
    if v_existing.mutation_requests -> p_request_id::text is distinct from v_payload then
      raise exception 'Chave de requisicao reutilizada com dados diferentes.';
    end if;
    return jsonb_build_object('expense_id', v_existing.id, 'amount', v_existing.amount, 'replayed', true);
  end if;

  v_remaining := private.wallet_effective_cycle_amount(v_user, p_card_id, v_month);
  if v_remaining <= 0 then
    raise exception 'Nao ha saldo restante nesta fatura.';
  end if;
  if v_remaining <> round(p_expected_remainder, 2) then
    raise exception 'O saldo da fatura mudou. Atualize a tela e tente novamente.';
  end if;

  if v_mode = 'ROLL_TO_NEXT' then
    v_amount := v_remaining;
    v_count := 1;
  else
    v_count := coalesce(p_installment_count, 0);
    v_amount := round(coalesce(p_total_amount, 0), 2);
    if v_count not between 1 and 120 then raise exception 'Quantidade de parcelas invalida.'; end if;
    if p_total_amount is null or p_total_amount <> v_amount or v_amount < v_remaining then
      raise exception 'O total parcelado nao pode ser menor que o saldo restante.';
    end if;
  end if;

  -- Quita o restante na fatura atual (sem conta: o valor segue para outra fatura).
  perform public.personal_wallet_pay_invoice_partial(
    p_card_id, v_month, null, v_remaining,
    md5(p_request_id::text || ':remainder-clear')::uuid
  );

  v_label := to_char(v_month, 'MM/YYYY');
  v_expense_id := public.personal_wallet_create_expense(
    case when v_mode = 'ROLL_TO_NEXT'
      then 'Saldo restante da fatura ' || v_label
      else 'Parcelamento da fatura ' || v_label end,
    v_amount,
    case when v_mode = 'ROLL_TO_NEXT' then 'Outros' else 'Parcelamento de fatura' end,
    (now() at time zone 'America/Manaus')::date,
    v_next, null, p_card_id, 'PENDING', v_count, null,
    case when v_mode = 'ROLL_TO_NEXT'
      then 'Transferido para a próxima fatura'
      else 'Saldo financiado: ' || to_char(v_remaining, 'FM999999990.00') || ' em ' || v_count || 'x' end,
    p_request_id
  );
  update public.personal_wallet_expenses
    set mutation_requests = mutation_requests || jsonb_build_object(p_request_id::text, v_payload)
    where id = v_expense_id;
  perform private.wallet_recalculate_card_position(v_user, p_card_id);

  return jsonb_build_object(
    'expense_id', v_expense_id,
    'cleared_amount', v_remaining,
    'amount', v_amount,
    'installment_count', v_count,
    'replayed', false
  );
end;
$$;

-- 2. Antecipação: move as próximas parcelas para a fatura escolhida, sem recriar a compra.
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
      where p.owner_user_id = v_user and p.card_id = v_expense.card_id and p.due_month = v_target)
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

-- 3. Exclusão de parcelas: só a atual, ou a atual e as seguintes; as demais ficam intactas.
create or replace function public.personal_wallet_cancel_installments(
  p_expense_id uuid,
  p_installment_id uuid,
  p_scope text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_scope text := upper(coalesce(p_scope, ''));
  v_expense public.personal_wallet_expenses%rowtype;
  v_target public.personal_wallet_expense_installments%rowtype;
  v_payload jsonb;
  v_remaining_amount numeric(14,2);
  v_remaining_count integer;
  v_canceled integer;
  v_position jsonb;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_expense_id is null or p_installment_id is null or p_request_id is null then
    raise exception 'Parametros obrigatorios ausentes.';
  end if;
  if v_scope not in ('ONLY_CURRENT', 'CURRENT_AND_NEXT') then
    raise exception 'Escolha excluir so esta parcela ou esta e as seguintes.';
  end if;
  v_payload := jsonb_build_object('operation', 'CANCEL_INSTALLMENTS', 'expense_id', p_expense_id,
    'installment_id', p_installment_id, 'scope', v_scope);

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
  if v_expense.card_id is null or v_expense.entry_type <> 'PURCHASE' or v_expense.status = 'CANCELED' then
    raise exception 'Somente compras ativas no cartao podem ter parcelas excluidas.';
  end if;
  -- Mesma ordem de travas do pagamento de fatura: cartão antes das parcelas.
  perform 1 from public.personal_wallet_cards
    where id = v_expense.card_id and owner_user_id = v_user for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;

  select * into v_target from public.personal_wallet_expense_installments
    where id = p_installment_id and expense_id = p_expense_id and owner_user_id = v_user for update;
  if not found then raise exception 'Parcela nao encontrada neste lancamento.'; end if;
  if v_target.status <> 'PENDING' or coalesce(v_target.paid_amount, 0) > 0 then
    raise exception 'Nao e possivel excluir uma parcela paga.';
  end if;
  if v_scope = 'CURRENT_AND_NEXT' and exists(
    select 1 from public.personal_wallet_expense_installments i
    where i.expense_id = p_expense_id and i.installment_number > v_target.installment_number
      and i.status <> 'CANCELED' and (i.status = 'PAID' or coalesce(i.paid_amount, 0) > 0)) then
    raise exception 'Ha parcela seguinte ja paga; exclua so esta parcela.';
  end if;

  update public.personal_wallet_expense_installments i
    set status = 'CANCELED'
  where i.expense_id = p_expense_id and i.status = 'PENDING' and coalesce(i.paid_amount, 0) = 0
    and (i.id = p_installment_id
      or (v_scope = 'CURRENT_AND_NEXT' and i.installment_number > v_target.installment_number));
  get diagnostics v_canceled = row_count;

  select coalesce(sum(amount), 0), count(*) into v_remaining_amount, v_remaining_count
  from public.personal_wallet_expense_installments
  where expense_id = p_expense_id and status <> 'CANCELED';

  -- O total da compra passa a ser o das parcelas que continuam; a numeração não muda.
  update public.personal_wallet_expenses
    set amount = case when v_remaining_count > 0 then v_remaining_amount else amount end,
        status = case
          when v_remaining_count = 0 then 'CANCELED'
          when not exists(select 1 from public.personal_wallet_expense_installments
            where expense_id = p_expense_id and status = 'PENDING') then 'PAID'
          else status end,
        mutation_requests = mutation_requests || jsonb_build_object(p_request_id::text, v_payload),
        updated_at = now()
  where id = p_expense_id;

  v_position := private.wallet_recalculate_card_position(v_user, v_expense.card_id);
  return v_position || jsonb_build_object('replayed', false, 'canceled_count', v_canceled,
    'remaining_count', v_remaining_count);
end;
$$;

revoke all on function public.personal_wallet_roll_invoice_remainder(uuid, date, text, date, numeric, integer, numeric, uuid) from public, anon;
grant execute on function public.personal_wallet_roll_invoice_remainder(uuid, date, text, date, numeric, integer, numeric, uuid) to authenticated;
revoke all on function public.personal_wallet_advance_installments(uuid, date, integer, numeric, uuid) from public, anon;
grant execute on function public.personal_wallet_advance_installments(uuid, date, integer, numeric, uuid) to authenticated;
revoke all on function public.personal_wallet_cancel_installments(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.personal_wallet_cancel_installments(uuid, uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
