drop policy if exists personal_wallet_accounts_owner_all on public.personal_wallet_accounts;
create policy personal_wallet_accounts_owner_all on public.personal_wallet_accounts
  for all to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
  with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

drop policy if exists personal_wallet_cards_owner_all on public.personal_wallet_cards;
create policy personal_wallet_cards_owner_all on public.personal_wallet_cards
  for all to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
  with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

drop policy if exists personal_wallet_expenses_owner_all on public.personal_wallet_expenses;
create policy personal_wallet_expenses_owner_all on public.personal_wallet_expenses
  for all to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
  with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

drop policy if exists personal_wallet_installments_owner_all on public.personal_wallet_expense_installments;
create policy personal_wallet_installments_owner_all on public.personal_wallet_expense_installments
  for all to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
  with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

create or replace function public.personal_wallet_create_expense(
  p_description text,
  p_amount numeric,
  p_category text,
  p_expense_date date,
  p_due_date date default null,
  p_account_id uuid default null,
  p_card_id uuid default null,
  p_status text default 'PENDING',
  p_installment_count integer default 1,
  p_recurrence text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense_id uuid := gen_random_uuid();
  v_status text := upper(coalesce(p_status, 'PENDING'));
  v_due_date date := coalesce(p_due_date, p_expense_date);
  v_base_amount numeric(14,2);
  v_installment_amount numeric(14,2);
  v_card_balance numeric(14,2);
  v_card_limit numeric(14,2);
  v_account_balance numeric(14,2);
  v_next_invoice_month date;
  v_index integer;
begin
  if v_user_id is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if coalesce(trim(p_description), '') = '' then
    raise exception 'Informe a descricao da despesa.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da despesa deve ser maior que zero.';
  end if;
  if p_expense_date is null then
    raise exception 'Informe a data da despesa.';
  end if;
  if coalesce(p_installment_count, 0) < 1 or p_installment_count > 120 then
    raise exception 'Quantidade de parcelas invalida.';
  end if;
  if (p_account_id is null) = (p_card_id is null) then
    raise exception 'Escolha somente uma conta ou um cartao.';
  end if;
  if v_status not in ('PENDING', 'PAID') then
    raise exception 'Status inicial invalido.';
  end if;

  if p_account_id is not null then
    select balance into v_account_balance
    from public.personal_wallet_accounts
    where id = p_account_id and owner_user_id = v_user_id
    for update;
    if not found then
      raise exception 'Conta nao encontrada.';
    end if;
    if v_status = 'PAID' and v_account_balance < p_amount then
      raise exception 'Saldo insuficiente na conta pessoal.';
    end if;
  else
    select used_limit, credit_limit into v_card_balance, v_card_limit
    from public.personal_wallet_cards
    where id = p_card_id and owner_user_id = v_user_id and status = 'ACTIVE'
    for update;
    if not found then
      raise exception 'Cartao ativo nao encontrado.';
    end if;
    if v_card_limit > 0 and v_card_balance + p_amount > v_card_limit then
      raise exception 'A despesa ultrapassa o limite disponivel do cartao.';
    end if;
    v_status := 'PENDING';
  end if;

  insert into public.personal_wallet_expenses (
    id, owner_user_id, description, amount, category, expense_date, due_date,
    account_id, card_id, status, installment_count, recurrence, notes
  ) values (
    v_expense_id, v_user_id, trim(p_description), round(p_amount, 2),
    coalesce(nullif(trim(p_category), ''), 'Outros'), p_expense_date, p_due_date,
    p_account_id, p_card_id, v_status, p_installment_count,
    nullif(trim(coalesce(p_recurrence, '')), ''), nullif(trim(coalesce(p_notes, '')), '')
  );

  v_base_amount := trunc((round(p_amount, 2) * 100) / p_installment_count) / 100;
  for v_index in 1..p_installment_count loop
    v_installment_amount := case
      when v_index = p_installment_count
        then round(p_amount, 2) - (v_base_amount * (p_installment_count - 1))
      else v_base_amount
    end;
    insert into public.personal_wallet_expense_installments (
      expense_id, owner_user_id, installment_number, due_month, amount, status
    ) values (
      v_expense_id, v_user_id, v_index,
      (date_trunc('month', v_due_date)::date + make_interval(months => v_index - 1))::date,
      v_installment_amount, v_status
    );
  end loop;

  if p_account_id is not null and v_status = 'PAID' then
    update public.personal_wallet_accounts
    set balance = round(balance - p_amount, 2), updated_at = now()
    where id = p_account_id;
  elsif p_card_id is not null then
    update public.personal_wallet_cards
    set used_limit = round(used_limit + p_amount, 2), updated_at = now()
    where id = p_card_id;

    select min(i.due_month) into v_next_invoice_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.card_id = p_card_id and i.status = 'PENDING';

    update public.personal_wallet_cards c
    set current_bill = coalesce((
      select round(sum(i.amount), 2)
      from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id = i.expense_id
      where e.card_id = c.id and i.status = 'PENDING' and i.due_month = v_next_invoice_month
    ), 0)
    where c.id = p_card_id;
  end if;

  return v_expense_id;
end;
$$;

create or replace function public.personal_wallet_set_expense_status(
  p_expense_id uuid,
  p_status text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
  v_status text := upper(coalesce(p_status, ''));
  v_account_balance numeric(14,2);
  v_paid_installments integer;
  v_next_invoice_month date;
begin
  if v_user_id is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if v_status not in ('PAID', 'CANCELED') then
    raise exception 'Status invalido.';
  end if;

  select * into v_expense
  from public.personal_wallet_expenses
  where id = p_expense_id and owner_user_id = v_user_id
  for update;
  if not found then
    raise exception 'Despesa nao encontrada.';
  end if;
  if v_expense.status = v_status then
    return;
  end if;
  if v_expense.status = 'CANCELED' then
    raise exception 'Despesa cancelada nao pode ser alterada.';
  end if;

  if v_expense.account_id is not null then
    select balance into v_account_balance
    from public.personal_wallet_accounts
    where id = v_expense.account_id and owner_user_id = v_user_id
    for update;
    if not found then
      raise exception 'Conta da despesa nao encontrada.';
    end if;
    if v_expense.status = 'PENDING' and v_status = 'PAID' then
      if v_account_balance < v_expense.amount then
        raise exception 'Saldo insuficiente na conta pessoal.';
      end if;
      update public.personal_wallet_accounts
      set balance = round(balance - v_expense.amount, 2), updated_at = now()
      where id = v_expense.account_id;
    elsif v_expense.status = 'PAID' and v_status = 'CANCELED' then
      update public.personal_wallet_accounts
      set balance = round(balance + v_expense.amount, 2), updated_at = now()
      where id = v_expense.account_id;
    end if;
  elsif v_expense.card_id is not null then
    if v_status = 'PAID' then
      raise exception 'Despesas de cartao sao quitadas pelo pagamento da fatura.';
    end if;
    select count(*) into v_paid_installments
    from public.personal_wallet_expense_installments
    where expense_id = p_expense_id and status = 'PAID';
    if v_paid_installments > 0 then
      raise exception 'Nao e possivel cancelar uma despesa com parcela de fatura paga.';
    end if;
    update public.personal_wallet_cards
    set used_limit = greatest(0, round(used_limit - v_expense.amount, 2)), updated_at = now()
    where id = v_expense.card_id and owner_user_id = v_user_id;
  end if;

  update public.personal_wallet_expenses
  set status = v_status, updated_at = now()
  where id = p_expense_id;
  update public.personal_wallet_expense_installments
  set status = v_status
  where expense_id = p_expense_id and status <> 'PAID';

  if v_expense.card_id is not null then
    select min(i.due_month) into v_next_invoice_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.card_id = v_expense.card_id and i.status = 'PENDING';
    update public.personal_wallet_cards c
    set current_bill = coalesce((
      select round(sum(i.amount), 2)
      from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id = i.expense_id
      where e.card_id = c.id and i.status = 'PENDING' and i.due_month = v_next_invoice_month
    ), 0)
    where c.id = v_expense.card_id;
  end if;
end;
$$;

create or replace function public.personal_wallet_pay_invoice(
  p_card_id uuid,
  p_due_month date,
  p_account_id uuid
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice_month date := date_trunc('month', p_due_month)::date;
  v_invoice_amount numeric(14,2);
  v_account_balance numeric(14,2);
  v_next_invoice_month date;
begin
  if v_user_id is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;

  perform 1 from public.personal_wallet_cards
  where id = p_card_id and owner_user_id = v_user_id and status = 'ACTIVE'
  for update;
  if not found then
    raise exception 'Cartao ativo nao encontrado.';
  end if;

  select balance into v_account_balance
  from public.personal_wallet_accounts
  where id = p_account_id and owner_user_id = v_user_id
  for update;
  if not found then
    raise exception 'Conta de pagamento nao encontrada.';
  end if;

  select round(sum(i.amount), 2) into v_invoice_amount
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id = i.expense_id
  where e.card_id = p_card_id
    and i.owner_user_id = v_user_id
    and i.due_month = v_invoice_month
    and i.status = 'PENDING';

  if coalesce(v_invoice_amount, 0) <= 0 then
    raise exception 'Nao existe fatura pendente para este periodo.';
  end if;
  if v_account_balance < v_invoice_amount then
    raise exception 'Saldo insuficiente na conta pessoal.';
  end if;

  update public.personal_wallet_accounts
  set balance = round(balance - v_invoice_amount, 2), updated_at = now()
  where id = p_account_id;

  update public.personal_wallet_expense_installments i
  set status = 'PAID'
  from public.personal_wallet_expenses e
  where e.id = i.expense_id
    and e.card_id = p_card_id
    and i.owner_user_id = v_user_id
    and i.due_month = v_invoice_month
    and i.status = 'PENDING';

  update public.personal_wallet_expenses e
  set status = 'PAID', updated_at = now()
  where e.card_id = p_card_id
    and e.owner_user_id = v_user_id
    and e.status = 'PENDING'
    and not exists (
      select 1 from public.personal_wallet_expense_installments i
      where i.expense_id = e.id and i.status = 'PENDING'
    );

  update public.personal_wallet_cards
  set used_limit = greatest(0, round(used_limit - v_invoice_amount, 2)), updated_at = now()
  where id = p_card_id;

  select min(i.due_month) into v_next_invoice_month
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id = i.expense_id
  where e.card_id = p_card_id and i.status = 'PENDING';

  update public.personal_wallet_cards c
  set current_bill = coalesce((
    select round(sum(i.amount), 2)
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.card_id = c.id and i.status = 'PENDING' and i.due_month = v_next_invoice_month
  ), 0)
  where c.id = p_card_id;

  return v_invoice_amount;
end;
$$;

revoke all on function public.personal_wallet_create_expense(text, numeric, text, date, date, uuid, uuid, text, integer, text, text) from public, anon;
revoke all on function public.personal_wallet_set_expense_status(uuid, text) from public, anon;
revoke all on function public.personal_wallet_pay_invoice(uuid, date, uuid) from public, anon;
grant execute on function public.personal_wallet_create_expense(text, numeric, text, date, date, uuid, uuid, text, integer, text, text) to authenticated;
grant execute on function public.personal_wallet_set_expense_status(uuid, text) to authenticated;
grant execute on function public.personal_wallet_pay_invoice(uuid, date, uuid) to authenticated;

revoke all on table public.personal_wallet_accounts from anon;
revoke all on table public.personal_wallet_cards from anon;
revoke all on table public.personal_wallet_expenses from anon;
revoke all on table public.personal_wallet_expense_installments from anon;
grant select, insert, update, delete on table public.personal_wallet_accounts to authenticated;
grant select, insert, update, delete on table public.personal_wallet_cards to authenticated;
grant select, insert, update, delete on table public.personal_wallet_expenses to authenticated;
grant select, insert, update, delete on table public.personal_wallet_expense_installments to authenticated;
