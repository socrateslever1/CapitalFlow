begin;

-- A manual closed-invoice amount is represented inside the canonical expense
-- domain. Itemized purchases remain auditable but are superseded mathematically
-- for the matching cycle.
alter table public.personal_wallet_expenses
  add column if not exists entry_type text not null default 'PURCHASE',
  add column if not exists invoice_due_month date,
  add column if not exists request_id uuid,
  add column if not exists mutation_requests jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='personal_wallet_expense_entry_type_valid'
      and conrelid='public.personal_wallet_expenses'::regclass
  ) then
    alter table public.personal_wallet_expenses
      add constraint personal_wallet_expense_entry_type_valid
      check (entry_type in ('PURCHASE','INVOICE_OVERRIDE'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='personal_wallet_invoice_override_shape_valid'
      and conrelid='public.personal_wallet_expenses'::regclass
  ) then
    alter table public.personal_wallet_expenses
      add constraint personal_wallet_invoice_override_shape_valid
      check (
        entry_type='PURCHASE'
        or (
          card_id is not null and account_id is null and installment_count=1
          and invoice_due_month is not null
          and invoice_due_month=date_trunc('month',invoice_due_month)::date
          and request_id is not null
        )
      );
  end if;
end $$;

create unique index if not exists uq_wallet_invoice_override_cycle
  on public.personal_wallet_expenses(owner_user_id,card_id,invoice_due_month)
  where entry_type='INVOICE_OVERRIDE' and status<>'CANCELED';
create unique index if not exists uq_wallet_expense_request
  on public.personal_wallet_expenses(owner_user_id,request_id)
  where request_id is not null;
create index if not exists idx_wallet_expense_mutation_requests
  on public.personal_wallet_expenses using gin(mutation_requests)
  where mutation_requests<>'{}'::jsonb;

create or replace function private.wallet_effective_cycle_amount(
  p_owner_id uuid,
  p_card_id uuid,
  p_due_month date
) returns numeric
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with target as (
    select date_trunc('month',p_due_month)::date as due_month
  ), override_expense as (
    select e.id
    from public.personal_wallet_expenses e,target t
    where e.owner_user_id=p_owner_id and e.card_id=p_card_id
      and e.entry_type='INVOICE_OVERRIDE' and e.status<>'CANCELED'
      and e.invoice_due_month=t.due_month
    limit 1
  )
  select coalesce(round(sum(i.amount-coalesce(i.paid_amount,0)),2),0)
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id=i.expense_id
  cross join target t
  where e.owner_user_id=p_owner_id and e.card_id=p_card_id
    and i.owner_user_id=p_owner_id and i.status<>'CANCELED'
    and i.due_month=t.due_month
    and (
      (exists(select 1 from override_expense) and e.id=(select id from override_expense))
      or
      (not exists(select 1 from override_expense) and e.entry_type='PURCHASE' and i.status='PENDING')
    );
$$;
revoke all on function private.wallet_effective_cycle_amount(uuid,uuid,date)
  from public,anon,authenticated,service_role;

create or replace function private.wallet_recalculate_card_position(
  p_owner_id uuid,
  p_card_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_credit_limit numeric(14,2);
  v_current_month date;
  v_current numeric(14,2):=0;
  v_future numeric(14,2):=0;
  v_committed numeric(14,2):=0;
begin
  select credit_limit into v_credit_limit
  from public.personal_wallet_cards
  where id=p_card_id and owner_user_id=p_owner_id
  for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;

  with candidate_months as (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.owner_user_id=p_owner_id and e.card_id=p_card_id
      and e.status<>'CANCELED' and i.status<>'CANCELED'
  ), effective as (
    select due_month,private.wallet_effective_cycle_amount(p_owner_id,p_card_id,due_month) amount
    from candidate_months
  )
  select min(due_month) into v_current_month from effective where amount>0;

  if v_current_month is not null then
    v_current:=private.wallet_effective_cycle_amount(p_owner_id,p_card_id,v_current_month);
    with candidate_months as (
      select distinct i.due_month
      from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id=i.expense_id
      where e.owner_user_id=p_owner_id and e.card_id=p_card_id
        and e.status<>'CANCELED' and i.status<>'CANCELED' and i.due_month>v_current_month
    )
    select coalesce(round(sum(private.wallet_effective_cycle_amount(
      p_owner_id,p_card_id,due_month
    )),2),0) into v_future from candidate_months;
  end if;
  v_committed:=round(v_current+v_future,2);

  update public.personal_wallet_cards
  set current_bill=v_current,used_limit=v_committed,updated_at=now()
  where id=p_card_id and owner_user_id=p_owner_id;

  return jsonb_build_object(
    'card_id',p_card_id,'due_month',v_current_month,
    'current_invoice',v_current,'future_commitments',v_future,
    'committed_limit',v_committed,
    'free_limit',greatest(0,round(v_credit_limit-v_committed,2))
  );
end;
$$;
revoke all on function private.wallet_recalculate_card_position(uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.personal_wallet_set_monthly_invoice_override(
  p_card_id uuid,
  p_due_month date,
  p_amount numeric,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_month date:=date_trunc('month',p_due_month)::date;
  v_expense public.personal_wallet_expenses%rowtype;
  v_replay public.personal_wallet_expenses%rowtype;
  v_payload jsonb;
  v_position jsonb;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_card_id is null or p_due_month is null or p_request_id is null then
    raise exception 'Parametros obrigatorios ausentes.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then
    raise exception 'Informe um valor positivo com ate duas casas decimais.';
  end if;
  v_payload:=jsonb_build_object('operation','INVOICE_OVERRIDE','card_id',p_card_id,
    'due_month',v_month,'amount',round(p_amount,2));

  perform pg_advisory_xact_lock(hashtextextended(
    v_user::text||':invoice-override:'||p_card_id::text||':'||v_month::text,0
  ));
  perform 1 from public.personal_wallet_cards
  where id=p_card_id and owner_user_id=v_user and status='ACTIVE'
  for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;

  select * into v_replay
  from public.personal_wallet_expenses
  where owner_user_id=v_user
    and (request_id=p_request_id or mutation_requests ? p_request_id::text)
  limit 1;
  if found then
    if coalesce(v_replay.mutation_requests->p_request_id::text,'null'::jsonb)<>v_payload then
      raise exception 'Chave de requisicao reutilizada com dados diferentes.';
    end if;
    return private.wallet_recalculate_card_position(v_user,p_card_id)
      || jsonb_build_object('expense_id',v_replay.id,'replayed',true);
  end if;

  select * into v_expense
  from public.personal_wallet_expenses
  where owner_user_id=v_user and card_id=p_card_id
    and entry_type='INVOICE_OVERRIDE' and invoice_due_month=v_month
    and status<>'CANCELED'
  for update;

  if found then
    if exists (
      select 1 from public.personal_wallet_expense_installments
      where expense_id=v_expense.id and coalesce(paid_amount,0)>0
    ) then raise exception 'Nao e possivel alterar uma fatura que ja recebeu pagamento.'; end if;
    update public.personal_wallet_expenses
    set amount=round(p_amount,2),description='Fatura consolidada '||to_char(v_month,'MM/YYYY'),
        due_date=v_month,mutation_requests=mutation_requests||jsonb_build_object(p_request_id::text,v_payload),
        updated_at=now()
    where id=v_expense.id;
    update public.personal_wallet_expense_installments
    set amount=round(p_amount,2),paid_amount=0,status='PENDING'
    where expense_id=v_expense.id;
  else
    insert into public.personal_wallet_expenses(
      owner_user_id,description,amount,category,expense_date,due_date,card_id,status,
      installment_count,notes,entry_type,invoice_due_month,request_id,mutation_requests
    ) values (
      v_user,'Fatura consolidada '||to_char(v_month,'MM/YYYY'),round(p_amount,2),
      'Ajuste de fatura',current_date,v_month,p_card_id,'PENDING',1,
      'Valor fechado informado manualmente; substitui o somatorio do ciclo sem apagar os lancamentos.',
      'INVOICE_OVERRIDE',v_month,p_request_id,jsonb_build_object(p_request_id::text,v_payload)
    ) returning * into v_expense;
    insert into public.personal_wallet_expense_installments(
      expense_id,owner_user_id,installment_number,due_month,amount,paid_amount,status
    ) values (v_expense.id,v_user,1,v_month,round(p_amount,2),0,'PENDING');
  end if;

  v_position:=private.wallet_recalculate_card_position(v_user,p_card_id);
  return v_position||jsonb_build_object('expense_id',v_expense.id,'replayed',false);
end;
$$;

create or replace function public.personal_wallet_update_expense_idempotent(
  p_expense_id uuid,p_description text,p_amount numeric,p_category text,
  p_expense_date date,p_due_date date,p_notes text,p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
  v_card public.personal_wallet_cards%rowtype;
  v_due date:=coalesce(p_due_date,p_expense_date);
  v_payload jsonb;
  v_base numeric(14,2);
  v_piece numeric(14,2);
  v_index integer;
  v_position jsonb;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if p_request_id is null or p_expense_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  if coalesce(trim(p_description),'')='' or length(trim(p_description))>240 then raise exception 'Informe uma descricao com ate 240 caracteres.'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Informe um valor positivo com ate duas casas decimais.'; end if;
  if p_expense_date is null then raise exception 'Informe a data da despesa.'; end if;
  v_payload:=jsonb_build_object('operation','UPDATE_EXPENSE','expense_id',p_expense_id,
    'description',trim(p_description),'amount',round(p_amount,2),'category',coalesce(nullif(trim(p_category),''),'Outros'),
    'expense_date',p_expense_date,'due_date',p_due_date,'notes',nullif(trim(coalesce(p_notes,'')),''));

  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':expense:'||p_expense_id::text,0));
  select * into v_expense from public.personal_wallet_expenses
  where id=p_expense_id and owner_user_id=v_user for update;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;
  if v_expense.mutation_requests ? p_request_id::text then
    if v_expense.mutation_requests->p_request_id::text<>v_payload then raise exception 'Chave de requisicao reutilizada com dados diferentes.'; end if;
    return private.wallet_recalculate_card_position(v_user,v_expense.card_id)||jsonb_build_object('replayed',true);
  end if;
  if exists(select 1 from public.personal_wallet_expenses e where e.owner_user_id=v_user and e.id<>p_expense_id and e.mutation_requests ? p_request_id::text) then
    raise exception 'Chave de requisicao ja utilizada em outro lancamento.';
  end if;
  if v_expense.card_id is null or v_expense.entry_type<>'PURCHASE' or v_expense.status<>'PENDING' then
    raise exception 'Somente lancamentos pendentes de compra podem ser editados.';
  end if;
  if exists(select 1 from public.personal_wallet_expense_installments where expense_id=p_expense_id and (status='PAID' or paid_amount>0)) then
    raise exception 'Nao e possivel editar um lancamento com parcela paga.';
  end if;
  select * into v_card from public.personal_wallet_cards
  where id=v_expense.card_id and owner_user_id=v_user for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;

  update public.personal_wallet_expenses
  set description=trim(p_description),amount=round(p_amount,2),
      category=coalesce(nullif(trim(p_category),''),'Outros'),expense_date=p_expense_date,
      due_date=p_due_date,notes=nullif(trim(coalesce(p_notes,'')),''),
      mutation_requests=mutation_requests||jsonb_build_object(p_request_id::text,v_payload),updated_at=now()
  where id=p_expense_id;
  delete from public.personal_wallet_expense_installments where expense_id=p_expense_id;
  v_base:=trunc((round(p_amount,2)*100)/v_expense.installment_count)/100;
  for v_index in 1..v_expense.installment_count loop
    v_piece:=case when v_index=v_expense.installment_count
      then round(p_amount,2)-v_base*(v_expense.installment_count-1) else v_base end;
    insert into public.personal_wallet_expense_installments(
      expense_id,owner_user_id,installment_number,due_month,amount,paid_amount,status
    ) values (p_expense_id,v_user,v_index,
      (date_trunc('month',v_due)::date+make_interval(months=>v_index-1))::date,v_piece,0,'PENDING');
  end loop;
  v_position:=private.wallet_recalculate_card_position(v_user,v_expense.card_id);
  if (v_position->>'committed_limit')::numeric>v_card.credit_limit and v_card.credit_limit>0 then
    raise exception 'A alteracao ultrapassa o limite contratado do cartao.';
  end if;
  return v_position||jsonb_build_object('replayed',false);
end;
$$;

create or replace function public.personal_wallet_cancel_expense_idempotent(
  p_expense_id uuid,p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
  v_payload jsonb;
  v_position jsonb;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if p_expense_id is null or p_request_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  v_payload:=jsonb_build_object('operation','CANCEL_EXPENSE','expense_id',p_expense_id);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':expense:'||p_expense_id::text,0));
  select * into v_expense from public.personal_wallet_expenses
  where id=p_expense_id and owner_user_id=v_user for update;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;
  if v_expense.mutation_requests ? p_request_id::text then
    if v_expense.mutation_requests->p_request_id::text<>v_payload then raise exception 'Chave de requisicao reutilizada com dados diferentes.'; end if;
    return private.wallet_recalculate_card_position(v_user,v_expense.card_id)||jsonb_build_object('replayed',true);
  end if;
  if exists(select 1 from public.personal_wallet_expenses e where e.owner_user_id=v_user and e.id<>p_expense_id and e.mutation_requests ? p_request_id::text) then
    raise exception 'Chave de requisicao ja utilizada em outro lancamento.';
  end if;
  if v_expense.card_id is null or v_expense.entry_type<>'PURCHASE' then raise exception 'Somente lancamentos individuais de compra podem ser excluidos.'; end if;
  if v_expense.status='CANCELED' then raise exception 'Lancamento ja cancelado por outra requisicao.'; end if;
  if exists(select 1 from public.personal_wallet_expense_installments where expense_id=p_expense_id and (status='PAID' or paid_amount>0)) then
    raise exception 'Nao e possivel excluir um lancamento com parcela paga.';
  end if;
  perform 1 from public.personal_wallet_cards where id=v_expense.card_id and owner_user_id=v_user for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  update public.personal_wallet_expenses
  set status='CANCELED',mutation_requests=mutation_requests||jsonb_build_object(p_request_id::text,v_payload),updated_at=now()
  where id=p_expense_id;
  update public.personal_wallet_expense_installments set status='CANCELED'
  where expense_id=p_expense_id and status<>'PAID';
  v_position:=private.wallet_recalculate_card_position(v_user,v_expense.card_id);
  return v_position||jsonb_build_object('replayed',false);
end;
$$;

-- Keep the canonical payment RPC name and request-id contract, but allocate an
-- overridden cycle only against its consolidated installment.
create or replace function public.personal_wallet_pay_invoice_partial(
  p_card_id uuid,p_due_month date,p_account_id uuid,p_amount numeric,p_request_id uuid
) returns numeric
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_month date:=date_trunc('month',p_due_month)::date;
  v_existing public.personal_wallet_invoice_payments%rowtype;
  v_override_id uuid;
  v_remaining numeric(14,2);
  v_allocate numeric(14,2);
  v_applied numeric(14,2);
  v_balance numeric(14,2);
  v_card_name text;
  v_row record;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if p_card_id is null or p_due_month is null or p_request_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Informe um pagamento valido com ate duas casas decimais.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':invoice-payment:'||p_card_id::text,0));
  select nickname into v_card_name from public.personal_wallet_cards
  where id=p_card_id and owner_user_id=v_user and status='ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;
  select * into v_existing from public.personal_wallet_invoice_payments
  where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.card_id<>p_card_id or v_existing.due_month<>v_month
      or v_existing.account_id is distinct from p_account_id or v_existing.amount<>p_amount
    then raise exception 'Chave de pagamento ja utilizada com dados diferentes.'; end if;
    return v_existing.amount;
  end if;
  if p_account_id is not null then
    select balance into v_balance from public.personal_wallet_accounts
    where id=p_account_id and owner_user_id=v_user for update;
    if not found then raise exception 'Conta de pagamento nao encontrada.'; end if;
    if v_balance<p_amount then raise exception 'Saldo insuficiente na conta de origem.'; end if;
  end if;
  select id into v_override_id from public.personal_wallet_expenses
  where owner_user_id=v_user and card_id=p_card_id and entry_type='INVOICE_OVERRIDE'
    and invoice_due_month=v_month and status<>'CANCELED' limit 1;
  v_remaining:=private.wallet_effective_cycle_amount(v_user,p_card_id,v_month);
  if v_remaining<=0 then raise exception 'Nao existe fatura pendente para este periodo.'; end if;
  if p_amount>v_remaining then raise exception 'Pagamento excede o saldo restante da fatura.'; end if;
  v_allocate:=p_amount;
  for v_row in
    select i.id,i.amount,i.paid_amount
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.owner_user_id=v_user and e.card_id=p_card_id and i.owner_user_id=v_user
      and i.due_month=v_month and i.status='PENDING'
      and ((v_override_id is not null and e.id=v_override_id)
        or (v_override_id is null and e.entry_type='PURCHASE'))
    order by i.installment_number,i.id for update of i
  loop
    exit when v_allocate=0;
    v_applied:=least(v_allocate,v_row.amount-v_row.paid_amount);
    update public.personal_wallet_expense_installments
    set paid_amount=paid_amount+v_applied,
        status=case when paid_amount+v_applied>=amount then 'PAID' else 'PENDING' end
    where id=v_row.id;
    v_allocate:=v_allocate-v_applied;
  end loop;
  if v_allocate<>0 then raise exception 'Inconsistencia na alocacao do pagamento.'; end if;
  if p_account_id is not null then
    update public.personal_wallet_accounts set balance=round(balance-p_amount,2),updated_at=now()
    where id=p_account_id and owner_user_id=v_user;
  end if;
  insert into public.personal_wallet_invoice_payments(owner_user_id,card_id,due_month,account_id,amount,request_id,source)
  values(v_user,p_card_id,v_month,p_account_id,p_amount,p_request_id,
    case when p_account_id is null then 'MANUAL' else 'ACCOUNT' end);
  if p_account_id is not null then
    insert into public.personal_wallet_account_operations(
      owner_user_id,request_id,operation_type,from_account_id,to_account_id,amount,
      description,category,operation_date,occurred_at
    ) values(v_user,p_request_id,'PAYMENT',p_account_id,null,p_amount,
      left('Pagamento de fatura - '||coalesce(v_card_name,'Cartao')||' - '||to_char(v_month,'MM/YYYY'),240),
      'Cartao de credito',(now() at time zone 'America/Manaus')::date,now());
  end if;
  update public.personal_wallet_expenses e set status='PAID',updated_at=now()
  where e.card_id=p_card_id and e.owner_user_id=v_user and e.status='PENDING'
    and not exists(select 1 from public.personal_wallet_expense_installments i where i.expense_id=e.id and i.status='PENDING');
  perform private.wallet_recalculate_card_position(v_user,p_card_id);
  return p_amount;
end;
$$;

create or replace function public.personal_wallet_pay_invoice(
  p_card_id uuid,p_due_month date,p_account_id uuid
) returns numeric
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_amount numeric(14,2);
  v_month date:=date_trunc('month',p_due_month)::date;
begin
  if auth.uid() is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  v_amount:=private.wallet_effective_cycle_amount(auth.uid(),p_card_id,v_month);
  if v_amount<=0 then raise exception 'Nao existe fatura pendente para este periodo.'; end if;
  return public.personal_wallet_pay_invoice_partial(p_card_id,v_month,p_account_id,v_amount,gen_random_uuid());
end;
$$;

-- Existing card updates that assign current_bill (for example create_expense)
-- are normalized to the effective Phase 3 position before the row is stored.
create or replace function private.wallet_preserve_partial_bill_balance()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_month date;
  v_future numeric(14,2):=0;
begin
  with candidate_months as (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=new.id and e.owner_user_id=new.owner_user_id
      and e.status<>'CANCELED' and i.status<>'CANCELED'
  ), effective as (
    select due_month,private.wallet_effective_cycle_amount(new.owner_user_id,new.id,due_month) amount
    from candidate_months
  ) select min(due_month) into v_month from effective where amount>0;
  new.current_bill:=case when v_month is null then 0
    else private.wallet_effective_cycle_amount(new.owner_user_id,new.id,v_month) end;
  with candidate_months as (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=new.id and e.owner_user_id=new.owner_user_id
      and e.status<>'CANCELED' and i.status<>'CANCELED'
      and (v_month is null or i.due_month>v_month)
  ) select coalesce(round(sum(private.wallet_effective_cycle_amount(
      new.owner_user_id,new.id,due_month
    )),2),0) into v_future from candidate_months;
  new.used_limit:=round(new.current_bill+v_future,2);
  return new;
end;
$$;
revoke all on function private.wallet_preserve_partial_bill_balance()
  from public,anon,authenticated,service_role;

revoke all on function public.personal_wallet_set_monthly_invoice_override(uuid,date,numeric,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.personal_wallet_update_expense_idempotent(uuid,text,numeric,text,date,date,text,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.personal_wallet_cancel_expense_idempotent(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.personal_wallet_pay_invoice_partial(uuid,date,uuid,numeric,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.personal_wallet_pay_invoice(uuid,date,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.personal_wallet_set_monthly_invoice_override(uuid,date,numeric,uuid) to authenticated;
grant execute on function public.personal_wallet_update_expense_idempotent(uuid,text,numeric,text,date,date,text,uuid) to authenticated;
grant execute on function public.personal_wallet_cancel_expense_idempotent(uuid,uuid) to authenticated;
grant execute on function public.personal_wallet_pay_invoice_partial(uuid,date,uuid,numeric,uuid) to authenticated;
grant execute on function public.personal_wallet_pay_invoice(uuid,date,uuid) to authenticated;

commit;
