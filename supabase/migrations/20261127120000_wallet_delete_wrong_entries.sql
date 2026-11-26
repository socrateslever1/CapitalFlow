-- Exclusão definitiva de lançamentos inseridos por engano (pedido do proprietário):
-- o que foi apagado não fica no banco para não gerar dúvida em auditorias futuras.
-- Só apaga o que não tem efeito financeiro já realizado: compra sem parcela paga e sem vínculo,
-- movimentação manual de conta sem vínculo (o saldo é devolvido na mesma transação).
-- A tabela de recibos guarda só identificadores (sem valor nem descrição), para a repetição
-- da mesma requisição responder "já apagado" em vez de erro.

create table if not exists public.personal_wallet_deletion_receipts (
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  kind text not null check (kind in ('EXPENSE', 'OPERATION')),
  target_id uuid not null,
  card_id uuid,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, request_id)
);
alter table public.personal_wallet_deletion_receipts enable row level security;
revoke all on public.personal_wallet_deletion_receipts from public, anon, authenticated;

create or replace function public.personal_wallet_delete_wrong_expense(p_expense_id uuid, p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
  v_receipt public.personal_wallet_deletion_receipts%rowtype;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_expense_id is null or p_request_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':expense:' || p_expense_id::text, 0));
  select * into v_receipt from public.personal_wallet_deletion_receipts
   where owner_user_id = v_user and request_id = p_request_id;
  if found then
    if v_receipt.kind <> 'EXPENSE' or v_receipt.target_id <> p_expense_id then
      raise exception 'Chave de requisicao ja utilizada em outro lancamento.';
    end if;
    return private.wallet_recalculate_card_position(v_user, v_receipt.card_id) || jsonb_build_object('deleted', true, 'replayed', true);
  end if;
  select * into v_expense from public.personal_wallet_expenses
   where id = p_expense_id and owner_user_id = v_user;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;
  if v_expense.card_id is null or v_expense.entry_type <> 'PURCHASE' then
    raise exception 'Somente compras do cartao podem ser apagadas por aqui.';
  end if;
  -- Mesma ordem de travas do pagamento de fatura: cartão, depois parcelas, depois a compra.
  -- Assim um pagamento em andamento termina antes e a checagem de parcela paga vê o estado final.
  perform 1 from public.personal_wallet_cards where id = v_expense.card_id and owner_user_id = v_user for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  perform 1 from public.personal_wallet_expense_installments where expense_id = p_expense_id for update;
  select * into v_expense from public.personal_wallet_expenses
   where id = p_expense_id and owner_user_id = v_user for update;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;
  if exists (select 1 from public.personal_wallet_expense_installments
              where expense_id = p_expense_id and (status = 'PAID' or paid_amount > 0)) then
    raise exception 'Compra com parcela paga nao pode ser apagada. Reabra a fatura antes, se o pagamento foi por engano.';
  end if;
  if exists (select 1 from public.loan_card_wallet_charges where expense_id = p_expense_id)
     or exists (select 1 from public.personal_wallet_payable_payments where expense_id = p_expense_id)
     or exists (select 1 from public.personal_wallet_payable_payment_sources where expense_id = p_expense_id) then
    raise exception 'Compra vinculada a emprestimo ou conta a pagar: desfaca o vinculo antes.';
  end if;
  -- Compras geradas por outras operações da fatura têm contrapartida em outro registro.
  if exists (select 1 from jsonb_each(v_expense.mutation_requests) e
              where e.value ->> 'operation' = 'ROLL_INVOICE_REMAINDER'
                 or (e.value ->> 'operation' = 'ADVANCE_INSTALLMENTS' and coalesce((e.value ->> 'discount')::numeric, 0) > 0)) then
    raise exception 'Este lancamento veio de "levar o restante" ou de antecipacao com desconto: desfaca pela fatura de origem.';
  end if;

  -- Marcações de importação ligadas à compra também saem: reimportar o arquivo certo não acusa repetição.
  delete from public.personal_wallet_statement_rows where owner_user_id = v_user and expense_id = p_expense_id;
  delete from public.personal_wallet_expense_installments
   where expense_id = p_expense_id and status <> 'PAID' and coalesce(paid_amount, 0) = 0;
  if exists (select 1 from public.personal_wallet_expense_installments where expense_id = p_expense_id) then
    raise exception 'Compra com parcela paga nao pode ser apagada.';
  end if;
  delete from public.personal_wallet_expenses where id = p_expense_id and owner_user_id = v_user;
  insert into public.personal_wallet_deletion_receipts (owner_user_id, request_id, kind, target_id, card_id)
  values (v_user, p_request_id, 'EXPENSE', p_expense_id, v_expense.card_id);
  return private.wallet_recalculate_card_position(v_user, v_expense.card_id) || jsonb_build_object('deleted', true, 'replayed', false);
end;
$$;

create or replace function public.personal_wallet_delete_wrong_operation(p_operation_id uuid, p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_op public.personal_wallet_account_operations%rowtype;
  v_pair uuid;
  v_ids uuid[];
  v_account uuid;
  v_balance numeric;
  v_receipt public.personal_wallet_deletion_receipts%rowtype;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_operation_id is null or p_request_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  -- Mesma serialização por dono das operações de conta.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 18273));
  select * into v_receipt from public.personal_wallet_deletion_receipts
   where owner_user_id = v_user and request_id = p_request_id;
  if found then
    if v_receipt.kind <> 'OPERATION' or v_receipt.target_id <> p_operation_id then
      raise exception 'Chave de requisicao ja utilizada em outro lancamento.';
    end if;
    return jsonb_build_object('deleted', true, 'replayed', true);
  end if;
  select * into v_op from public.personal_wallet_account_operations
   where id = p_operation_id and owner_user_id = v_user for update;
  if not found then raise exception 'Lancamento nao encontrado nesta carteira.'; end if;
  -- Uma compensação aponta para o original: trata o par a partir do original.
  if v_op.voids_operation_id is not null then
    select * into v_op from public.personal_wallet_account_operations
     where id = v_op.voids_operation_id and owner_user_id = v_user for update;
    if not found then raise exception 'Lancamento original da anulacao nao encontrado.'; end if;
  end if;
  if v_op.operation_type not in ('EXPENSE', 'INCOME', 'RECEIPT')
     or v_op.contract_id is not null or v_op.installment_id is not null or v_op.charge_id is not null
     or v_op.category in ('Saldo inicial', 'Ajuste de Saldo', 'Estorno de lançamento')
     or (v_op.from_account_id is null) = (v_op.to_account_id is null) then
    raise exception 'Este registro exige procedimento proprio de estorno e nao pode ser apagado.';
  end if;
  if exists (select 1 from public.personal_wallet_accounts
              where id = coalesce(v_op.from_account_id, v_op.to_account_id) and archived_at is not null) then
    raise exception 'Conta arquivada: restaure a conta antes de apagar lancamentos.';
  end if;
  select id into v_pair from public.personal_wallet_account_operations
   where owner_user_id = v_user and voids_operation_id = v_op.id for update;
  -- Anulado sem a compensação correspondente não é um par que se anula: não apaga.
  if v_op.voided_at is not null and v_pair is null then
    raise exception 'Lancamento anulado sem compensacao correspondente: nao pode ser apagado.';
  end if;
  v_ids := array_remove(array[v_op.id, v_pair], null);
  if exists (select 1 from public.personal_wallet_recurring_receipts where operation_id = any(v_ids))
     or exists (select 1 from public.personal_wallet_card_funding_reconciliations
                 where original_wallet_operation_id = any(v_ids) or reversal_wallet_operation_id = any(v_ids))
     or exists (select 1 from public.capital_source_wallet_transfers where wallet_operation_id = any(v_ids))
     or exists (select 1 from public.personal_wallet_pending_operations p, jsonb_each(p.mutation_requests) e
                 where p.owner_user_id = v_user and (e.value ->> 'operation_id')::uuid = any(v_ids)) then
    raise exception 'Movimentacao vinculada a receita fixa, capital, cartao ou pendente: use o fluxo de origem.';
  end if;

  if v_op.voided_at is null then
    -- Movimentação ativa: devolve o efeito no saldo.
    v_account := coalesce(v_op.from_account_id, v_op.to_account_id);
    select balance into v_balance from public.personal_wallet_accounts
     where id = v_account and owner_user_id = v_user for update;
    if not found then raise exception 'Conta nao encontrada.'; end if;
    if v_op.to_account_id is not null and v_balance < v_op.amount then
      raise exception 'Saldo insuficiente para apagar esta entrada: o valor ja foi usado.';
    end if;
    update public.personal_wallet_accounts
       set balance = round(balance + case when v_op.from_account_id is not null then v_op.amount else -v_op.amount end, 2),
           updated_at = now()
     where id = v_account and owner_user_id = v_user;
  end if;
  -- Par já anulado: os dois se compensam, o saldo não muda.

  delete from public.personal_wallet_manual_operation_revisions where operation_id = any(v_ids);
  delete from public.personal_wallet_account_operations where owner_user_id = v_user and voids_operation_id = v_op.id;
  delete from public.personal_wallet_account_operations where owner_user_id = v_user and id = v_op.id;
  insert into public.personal_wallet_deletion_receipts (owner_user_id, request_id, kind, target_id)
  values (v_user, p_request_id, 'OPERATION', p_operation_id);
  return jsonb_build_object('deleted', true, 'replayed', false, 'deleted_count', coalesce(array_length(v_ids, 1), 0));
end;
$$;

-- Exclusão de parcelas (só esta / esta e as seguintes): apaga em vez de cancelar.
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
  if v_user is null or not public.can_access_personal_wallet() then
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
  -- Compra que ficou sem parcelas foi apagada: a repetição responde pelo recibo.
  if exists(select 1 from public.personal_wallet_deletion_receipts
    where owner_user_id = v_user and request_id = p_request_id and kind = 'EXPENSE' and target_id = p_expense_id) then
    return private.wallet_recalculate_card_position(v_user,
      (select card_id from public.personal_wallet_deletion_receipts where owner_user_id = v_user and request_id = p_request_id))
      || jsonb_build_object('replayed', true);
  end if;
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

  -- Compras geradas por "levar o restante" ou antecipação com desconto têm contrapartida em outro
  -- registro: nenhuma parcela delas é apagada por aqui.
  if exists (select 1 from jsonb_each(v_expense.mutation_requests) e
              where e.value ->> 'operation' = 'ROLL_INVOICE_REMAINDER'
                 or (e.value ->> 'operation' = 'ADVANCE_INSTALLMENTS' and coalesce((e.value ->> 'discount')::numeric, 0) > 0)) then
    raise exception 'Este lancamento veio de "levar o restante" ou de antecipacao com desconto: desfaca pela fatura de origem.';
  end if;
  -- Parcelas excluídas saem do banco (sem registro cancelado que gere dúvida).
  delete from public.personal_wallet_expense_installments i
  where i.expense_id = p_expense_id and i.status = 'PENDING' and coalesce(i.paid_amount, 0) = 0
    and (i.id = p_installment_id
      or (v_scope = 'CURRENT_AND_NEXT' and i.installment_number > v_target.installment_number));
  get diagnostics v_canceled = row_count;

  select coalesce(sum(amount), 0), count(*) into v_remaining_amount, v_remaining_count
  from public.personal_wallet_expense_installments
  where expense_id = p_expense_id and status <> 'CANCELED';

  if v_remaining_count = 0 then
    -- Nenhuma parcela restante: a compra inteira sai do banco, com a marcação de importação.
    if exists (select 1 from public.loan_card_wallet_charges where expense_id = p_expense_id)
       or exists (select 1 from public.personal_wallet_payable_payments where expense_id = p_expense_id)
       or exists (select 1 from public.personal_wallet_payable_payment_sources where expense_id = p_expense_id) then
      raise exception 'Compra vinculada a emprestimo ou conta a pagar: desfaca o vinculo antes.';
    end if;
    if exists (select 1 from jsonb_each(v_expense.mutation_requests) e
                where e.value ->> 'operation' = 'ROLL_INVOICE_REMAINDER'
                   or (e.value ->> 'operation' = 'ADVANCE_INSTALLMENTS' and coalesce((e.value ->> 'discount')::numeric, 0) > 0)) then
      raise exception 'Este lancamento veio de "levar o restante" ou de antecipacao com desconto: desfaca pela fatura de origem.';
    end if;
    delete from public.personal_wallet_expense_installments where expense_id = p_expense_id;
    delete from public.personal_wallet_statement_rows where owner_user_id = v_user and expense_id = p_expense_id;
    delete from public.personal_wallet_expenses where id = p_expense_id and owner_user_id = v_user;
    insert into public.personal_wallet_deletion_receipts (owner_user_id, request_id, kind, target_id, card_id)
    values (v_user, p_request_id, 'EXPENSE', p_expense_id, v_expense.card_id);
    return private.wallet_recalculate_card_position(v_user, v_expense.card_id)
      || jsonb_build_object('replayed', false, 'canceled_count', v_canceled, 'remaining_count', 0, 'deleted', true);
  end if;

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

revoke all on function public.personal_wallet_delete_wrong_expense(uuid, uuid) from public, anon;
revoke all on function public.personal_wallet_delete_wrong_operation(uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_delete_wrong_expense(uuid, uuid) to authenticated;
grant execute on function public.personal_wallet_delete_wrong_operation(uuid, uuid) to authenticated;
