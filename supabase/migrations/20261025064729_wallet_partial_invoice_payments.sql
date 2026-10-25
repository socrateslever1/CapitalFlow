-- Carteira pessoal somente: registro idempotente de pagamentos parciais de fatura.
-- Nao altera o Motor Financeiro V4, contratos, ledger de emprestimos ou acordos.
-- Os valores originais das parcelas permanecem imutaveis: paid_amount guarda a amortizacao.
alter table public.personal_wallet_expense_installments
  add column if not exists paid_amount numeric(14,2) not null default 0;

alter table public.personal_wallet_expense_installments
  drop constraint if exists personal_wallet_installment_paid_amount_valid;
alter table public.personal_wallet_expense_installments
  add constraint personal_wallet_installment_paid_amount_valid
  check (paid_amount >= 0 and paid_amount <= amount);

create table if not exists public.personal_wallet_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  card_id uuid not null references public.personal_wallet_cards(id) on delete restrict,
  due_month date not null,
  account_id uuid references public.personal_wallet_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  request_id uuid not null,
  source text not null check (source in ('ACCOUNT','MANUAL')),
  created_at timestamptz not null default now(),
  unique (owner_user_id,request_id),
  check (due_month = date_trunc('month', due_month)::date),
  check ((source='ACCOUNT' and account_id is not null) or (source='MANUAL' and account_id is null))
);
create index if not exists personal_wallet_invoice_payments_card_month_idx
  on public.personal_wallet_invoice_payments (card_id, due_month, created_at desc);
alter table public.personal_wallet_invoice_payments enable row level security;
revoke all on public.personal_wallet_invoice_payments from public, anon, authenticated;
grant select on public.personal_wallet_invoice_payments to authenticated;
drop policy if exists wallet_invoice_payments_owner_read on public.personal_wallet_invoice_payments;
create policy wallet_invoice_payments_owner_read on public.personal_wallet_invoice_payments
  for select to authenticated
  using (owner_user_id = (select auth.uid()) and (select public.is_platform_super_admin()));

-- Funcoes de escrita usam SECURITY DEFINER com validacao explicita de uid,
-- super-admin e ownership. Nenhum INSERT/UPDATE/DELETE direto nesta tabela.
create or replace function public.personal_wallet_pay_invoice_partial(
  p_card_id uuid,
  p_due_month date,
  p_account_id uuid,
  p_amount numeric,
  p_request_id uuid
) returns numeric
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_month date;
  v_paid numeric(14,2);
  v_existing public.personal_wallet_invoice_payments%rowtype;
  v_remaining numeric(14,2) := 0;
  v_allocate numeric(14,2);
  v_applied numeric(14,2);
  v_row record;
  v_next_month date;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_card_id is null or p_due_month is null or p_request_id is null then
    raise exception 'Parametros obrigatorios ausentes.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then
    raise exception 'Informe um pagamento valido com ate duas casas decimais.';
  end if;
  v_month := date_trunc('month',p_due_month)::date;
  -- A trava de cartao serializa pagamentos concorrentes inclusive com contas distintas.
  perform 1 from public.personal_wallet_cards
    where id=p_card_id and owner_user_id=v_user and status='ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;

  select * into v_existing from public.personal_wallet_invoice_payments
    where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.card_id <> p_card_id
       or v_existing.due_month <> v_month
       or v_existing.account_id is distinct from p_account_id
       or v_existing.amount <> p_amount then
      raise exception 'Chave de pagamento ja utilizada com dados diferentes.';
    end if;
    return v_existing.amount; -- repeticao segura, sem novo debito
  end if;

  if p_account_id is not null then
    perform 1 from public.personal_wallet_accounts
      where id=p_account_id and owner_user_id=v_user for update;
    if not found then raise exception 'Conta de pagamento nao encontrada.'; end if;
  end if;

  select coalesce(round(sum(i.amount-i.paid_amount),2),0) into v_remaining
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id=i.expense_id
  where e.card_id=p_card_id and e.owner_user_id=v_user
    and i.owner_user_id=v_user and i.due_month=v_month and i.status='PENDING';

  if v_remaining <= 0 then raise exception 'Nao existe fatura pendente para este periodo.'; end if;
  if p_amount > v_remaining then raise exception 'Pagamento excede o saldo restante da fatura.'; end if;

  -- Distribuicao deterministica, sem alterar o valor original da parcela.
  v_allocate := p_amount;
  for v_row in
    select i.id,i.amount,i.paid_amount
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=p_card_id and e.owner_user_id=v_user
      and i.owner_user_id=v_user and i.due_month=v_month and i.status='PENDING'
    order by i.installment_number,i.id
    for update of i
  loop
    exit when v_allocate = 0;
    v_applied := least(v_allocate,v_row.amount-v_row.paid_amount);
    if v_applied > 0 then
      update public.personal_wallet_expense_installments
      set paid_amount=paid_amount+v_applied,
          status=case when paid_amount+v_applied >= amount then 'PAID' else 'PENDING' end
      where id=v_row.id;
      v_allocate := v_allocate-v_applied;
    end if;
  end loop;
  if v_allocate <> 0 then raise exception 'Inconsistencia na alocacao do pagamento.'; end if;

  -- Fonte externa nao cadastrada: registra pagamento manual SEM inventar debito bancario.
  if p_account_id is not null then
    update public.personal_wallet_accounts
      set balance=round(balance-p_amount,2),updated_at=now()
      where id=p_account_id and owner_user_id=v_user;
  end if;
  insert into public.personal_wallet_invoice_payments(
    owner_user_id,card_id,due_month,account_id,amount,request_id,source
  ) values (
    v_user,p_card_id,v_month,p_account_id,p_amount,p_request_id,
    case when p_account_id is null then 'MANUAL' else 'ACCOUNT' end
  );
  update public.personal_wallet_expenses e
  set status='PAID',updated_at=now()
  where e.card_id=p_card_id and e.owner_user_id=v_user and e.status='PENDING'
    and not exists (
      select 1 from public.personal_wallet_expense_installments i
      where i.expense_id=e.id and i.status='PENDING'
    );

  update public.personal_wallet_cards
  set used_limit=greatest(0,round(used_limit-p_amount,2)),updated_at=now()
  where id=p_card_id and owner_user_id=v_user;

  select min(i.due_month) into v_next_month
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id=i.expense_id
  where e.card_id=p_card_id and i.status='PENDING';
  update public.personal_wallet_cards
  set current_bill=coalesce((
    select round(sum(i.amount-i.paid_amount),2)
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=p_card_id and i.status='PENDING' and i.due_month=v_next_month
  ),0),updated_at=now()
  where id=p_card_id and owner_user_id=v_user;

  return p_amount;
end;
$$;
revoke all on function public.personal_wallet_pay_invoice_partial(uuid,date,uuid,numeric,uuid) from public,anon;
grant execute on function public.personal_wallet_pay_invoice_partial(uuid,date,uuid,numeric,uuid) to authenticated;

-- API legada de pagamento integral permanece compativel, mas paga apenas o RESTANTE.
create or replace function public.personal_wallet_pay_invoice(
  p_card_id uuid,p_due_month date,p_account_id uuid
) returns numeric
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_amount numeric(14,2); v_month date := date_trunc('month',p_due_month)::date;
begin
  select coalesce(round(sum(i.amount-i.paid_amount),2),0) into v_amount
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id=i.expense_id
  where e.card_id=p_card_id and i.owner_user_id=auth.uid()
    and i.due_month=v_month and i.status='PENDING';
  if v_amount<=0 then raise exception 'Nao existe fatura pendente para este periodo.'; end if;
  return public.personal_wallet_pay_invoice_partial(p_card_id,v_month,p_account_id,v_amount,gen_random_uuid());
end;
$$;
revoke all on function public.personal_wallet_pay_invoice(uuid,date,uuid) from public,anon;
grant execute on function public.personal_wallet_pay_invoice(uuid,date,uuid) to authenticated;

-- Cancela-la depois de uma amortizacao geraria liberacao duplicada do limite.
create or replace function private.wallet_prevent_paid_expense_cancellation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='CANCELED' and old.status is distinct from 'CANCELED'
     and exists (
       select 1 from public.personal_wallet_expense_installments i
       where i.expense_id=old.id and (i.paid_amount>0 or i.status='PAID')
     ) then
    raise exception 'Nao e possivel cancelar despesa com parcela ja paga.';
  end if;
  return new;
end;
$$;
revoke all on function private.wallet_prevent_paid_expense_cancellation() from public,anon,authenticated;
drop trigger if exists wallet_prevent_paid_expense_cancellation on public.personal_wallet_expenses;
create trigger wallet_prevent_paid_expense_cancellation
before update of status on public.personal_wallet_expenses
for each row execute function private.wallet_prevent_paid_expense_cancellation();

-- Manter current_bill correto quando um novo gasto recalcular a fatura antiga.
create or replace function private.wallet_preserve_partial_bill_balance()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_next date;
begin
  if exists (select 1 from public.personal_wallet_invoice_payments p where p.card_id=new.id) then
    select min(i.due_month) into v_next
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=new.id and i.status='PENDING';
    select coalesce(round(sum(i.amount-i.paid_amount),2),0) into new.current_bill
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=new.id and i.status='PENDING' and i.due_month=v_next;
  end if;
  return new;
end;
$$;
revoke all on function private.wallet_preserve_partial_bill_balance() from public,anon,authenticated;
drop trigger if exists wallet_preserve_partial_bill_balance on public.personal_wallet_cards;
create trigger wallet_preserve_partial_bill_balance
before update of current_bill on public.personal_wallet_cards
for each row execute function private.wallet_preserve_partial_bill_balance();
