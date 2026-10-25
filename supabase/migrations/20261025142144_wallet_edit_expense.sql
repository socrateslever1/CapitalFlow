begin;

create or replace function public.personal_wallet_update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_expense_date date,
  p_due_date date default null,
  p_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
  v_card public.personal_wallet_cards%rowtype;
  v_due_date date := coalesce(p_due_date, p_expense_date);
  v_base_amount numeric(14,2);
  v_installment_amount numeric(14,2);
  v_delta numeric(14,2);
  v_next_invoice_month date;
  v_index integer;
begin
  if v_user_id is null or not public.is_platform_super_admin() then
    raise exception 'Acesso não autorizado.';
  end if;
  if coalesce(trim(p_description), '') = '' or length(trim(p_description)) > 240 then
    raise exception 'Informe uma descrição com até 240 caracteres.';
  end if;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then
    raise exception 'Informe um valor positivo com até duas casas decimais.';
  end if;
  if p_expense_date is null then
    raise exception 'Informe a data da despesa.';
  end if;
  if length(coalesce(trim(p_category), '')) > 100 then
    raise exception 'A categoria deve ter até 100 caracteres.';
  end if;
  if length(coalesce(trim(p_notes), '')) > 2000 then
    raise exception 'As observações devem ter até 2.000 caracteres.';
  end if;

  select * into v_expense
  from public.personal_wallet_expenses
  where id = p_expense_id and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  if v_expense.card_id is null then
    raise exception 'Este fluxo edita apenas lançamentos de cartão.';
  end if;
  if v_expense.status <> 'PENDING' then
    raise exception 'Somente lançamentos pendentes podem ser editados.';
  end if;
  if exists (
    select 1
    from public.personal_wallet_expense_installments
    where expense_id = v_expense.id
      and (status = 'PAID' or coalesce(paid_amount, 0) > 0)
  ) then
    raise exception 'Não é possível editar um lançamento com parcela já paga.';
  end if;

  select * into v_card
  from public.personal_wallet_cards
  where id = v_expense.card_id and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Cartão não encontrado.';
  end if;

  v_delta := round(p_amount, 2) - v_expense.amount;
  if v_delta > 0 and v_card.credit_limit > 0 and v_card.used_limit + v_delta > v_card.credit_limit then
    raise exception 'A alteração ultrapassa o limite disponível do cartão.';
  end if;

  update public.personal_wallet_expenses
  set description = trim(p_description),
      amount = round(p_amount, 2),
      category = coalesce(nullif(trim(p_category), ''), 'Outros'),
      expense_date = p_expense_date,
      due_date = p_due_date,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = v_expense.id;

  delete from public.personal_wallet_expense_installments
  where expense_id = v_expense.id;

  v_base_amount := trunc((round(p_amount, 2) * 100) / v_expense.installment_count) / 100;
  for v_index in 1..v_expense.installment_count loop
    v_installment_amount := case
      when v_index = v_expense.installment_count
        then round(p_amount, 2) - (v_base_amount * (v_expense.installment_count - 1))
      else v_base_amount
    end;
    insert into public.personal_wallet_expense_installments (
      expense_id, owner_user_id, installment_number, due_month, amount, paid_amount, status
    ) values (
      v_expense.id, v_user_id, v_index,
      (date_trunc('month', v_due_date)::date + make_interval(months => v_index - 1))::date,
      v_installment_amount, 0, 'PENDING'
    );
  end loop;

  update public.personal_wallet_cards
  set used_limit = greatest(0, round(used_limit + v_delta, 2)),
      updated_at = now()
  where id = v_card.id;

  select min(i.due_month) into v_next_invoice_month
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id = i.expense_id
  where e.card_id = v_card.id and i.status = 'PENDING';

  update public.personal_wallet_cards c
  set current_bill = coalesce((
    select round(sum(i.amount - coalesce(i.paid_amount, 0)), 2)
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id = i.expense_id
    where e.card_id = c.id and i.status = 'PENDING' and i.due_month = v_next_invoice_month
  ), 0),
  updated_at = now()
  where c.id = v_card.id;
end;
$$;

revoke all on function public.personal_wallet_update_expense(uuid,text,numeric,text,date,date,text) from public, anon;
grant execute on function public.personal_wallet_update_expense(uuid,text,numeric,text,date,date,text) to authenticated;

commit;
