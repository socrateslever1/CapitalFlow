begin;
alter table public.personal_wallet_cards
 add column if not exists opening_invoice_state text check (opening_invoice_state in ('OPEN','CLOSED')),
 add column if not exists opening_invoice_month date,
 add column if not exists opening_summary_requests jsonb not null default '{}'::jsonb;
alter table public.personal_wallet_expenses add column if not exists is_opening_summary boolean not null default false;
alter table public.personal_wallet_expense_installments add column if not exists opening_invoice_id uuid references public.personal_wallet_expenses(id);

create or replace function public.personal_wallet_set_card_opening_summary(
 p_card_id uuid, p_credit_limit numeric, p_used_limit numeric, p_invoice_amount numeric,
 p_cycle_month date, p_invoice_state text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_owner uuid:=auth.uid(); v_card public.personal_wallet_cards%rowtype;
 v_month date:=date_trunc('month',p_cycle_month)::date; v_native numeric; v_other numeric;
 v_payload jsonb; v_result jsonb; v_invoice_id uuid;
begin
 if v_owner is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
 if p_card_id is null or p_request_id is null or p_cycle_month is null or p_invoice_state is null or p_invoice_state not in ('OPEN','CLOSED') then raise exception 'Informe cartao, mes e situacao da fatura.'; end if;
 if p_credit_limit is null or p_used_limit is null or p_invoice_amount is null
 or p_credit_limit::text in ('NaN','Infinity','-Infinity') or p_used_limit::text in ('NaN','Infinity','-Infinity') or p_invoice_amount::text in ('NaN','Infinity','-Infinity')
 or p_credit_limit<0 or p_used_limit<0 or p_invoice_amount<0
 or p_used_limit>p_credit_limit or p_invoice_amount>p_used_limit
 or p_credit_limit<>round(p_credit_limit,2) or p_used_limit<>round(p_used_limit,2) or p_invoice_amount<>round(p_invoice_amount,2)
 then raise exception 'Confira limite total, limite usado e fatura atual.'; end if;
 select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner and status='ACTIVE' for update;
 if not found then raise exception 'Cartao nao encontrado.'; end if;
 v_payload:=jsonb_build_object('limit',p_credit_limit,'used',p_used_limit,'invoice',p_invoice_amount,'month',v_month,'state',p_invoice_state);
 if v_card.opening_summary_requests ? p_request_id::text then
  if v_card.opening_summary_requests->p_request_id::text<>v_payload then raise exception 'Requisicao reutilizada com valores diferentes.'; end if;
  return jsonb_build_object('replayed',true);
 end if;
 -- Não move silenciosamente uma fatura consolidada anterior para outro ciclo.
 if exists(select 1 from public.personal_wallet_expenses where card_id=p_card_id and owner_user_id=v_owner and entry_type='INVOICE_OVERRIDE' and status<>'CANCELED' and invoice_due_month<>v_month)
 then raise exception 'Existe uma fatura consolidada em outro mes. Confira o ciclo antes de substituir a situacao inicial.'; end if;
 select coalesce(sum(private.wallet_effective_cycle_amount(v_owner,p_card_id,m.due_month)),0) into v_native
 from (select distinct i.due_month from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id
 where e.owner_user_id=v_owner and e.card_id=p_card_id and e.status<>'CANCELED' and i.status<>'CANCELED' and i.due_month>v_month) m;
 v_other:=round(p_used_limit-p_invoice_amount-v_native,2);
 if v_other<0 then raise exception 'O limite usado deve incluir a fatura e os gastos futuros cadastrados.'; end if;
 if p_invoice_amount=0 and exists(select 1 from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id where e.card_id=p_card_id and e.owner_user_id=v_owner and e.status<>'CANCELED' and i.status='PENDING' and i.due_month=v_month and i.amount>coalesce(i.paid_amount,0))
 then raise exception 'Este ciclo possui valores registrados. Revise o extrato antes de informar fatura zero.'; end if;
 v_result:=public.personal_wallet_set_card_initial_balances(p_card_id,p_credit_limit,p_invoice_amount,v_other,v_month,p_request_id);
 select id into v_invoice_id from public.personal_wallet_expenses where owner_user_id=v_owner and card_id=p_card_id and entry_type='INVOICE_OVERRIDE' and invoice_due_month=v_month and status<>'CANCELED';
 if v_invoice_id is not null then
  update public.personal_wallet_expenses set is_opening_summary=true,description='Fatura inicial informada' where id=v_invoice_id;
  update public.personal_wallet_expense_installments i set opening_invoice_id=v_invoice_id
  from public.personal_wallet_expenses e where i.expense_id=e.id and e.card_id=p_card_id and e.owner_user_id=v_owner and e.entry_type='PURCHASE' and e.status<>'CANCELED' and i.due_month=v_month;
 end if;
 update public.personal_wallet_cards set opening_invoice_month=v_month,opening_invoice_state=p_invoice_state,
 opening_summary_requests=opening_summary_requests||jsonb_build_object(p_request_id::text,v_payload)
 where id=p_card_id and owner_user_id=v_owner;
 return private.wallet_recalculate_card_position(v_owner,p_card_id,v_month);
end $$;
revoke all on function public.personal_wallet_set_card_opening_summary(uuid,numeric,numeric,numeric,date,text,uuid) from public,anon;
grant execute on function public.personal_wallet_set_card_opening_summary(uuid,numeric,numeric,numeric,date,text,uuid) to authenticated;

create or replace function private.wallet_effective_cycle_amount(p_owner_id uuid,p_card_id uuid,p_due_month date)
returns numeric language sql stable security definer set search_path=public,pg_temp as $$
 with invoice as (
 select id,is_opening_summary from public.personal_wallet_expenses
 where owner_user_id=p_owner_id and card_id=p_card_id and entry_type='INVOICE_OVERRIDE' and status<>'CANCELED'
 and invoice_due_month=date_trunc('month',p_due_month)::date limit 1
 )
 select coalesce(round(sum(greatest(0,i.amount-coalesce(i.paid_amount,0))),2),0)
 from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id
 where e.owner_user_id=p_owner_id and e.card_id=p_card_id and e.status<>'CANCELED' and i.status<>'CANCELED'
 and i.due_month=date_trunc('month',p_due_month)::date and (
 e.id=(select id from invoice) or
 (e.entry_type='PURCHASE' and i.status='PENDING' and
 (not exists(select 1 from invoice) or (exists(select 1 from invoice where is_opening_summary) and i.opening_invoice_id is distinct from (select id from invoice))))
 );
$$;
create or replace function public.personal_wallet_create_card_with_opening(
  p_card jsonb,
  p_existing_account_id uuid,
  p_opening jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid(); v_prior public.personal_wallet_cards%rowtype;
  v_created jsonb; v_card_id uuid; v_limit numeric; v_invoice numeric; v_future numeric;
begin
  if v_user is null or not public.is_platform_super_admin() or not exists (
    select 1 from public.user_modulos m where m.user_id=v_user and m.modulo_chave='carteira' and m.ativo
  ) then raise exception 'Acesso nao autorizado a Carteira.'; end if;
  if p_request_id is null or p_card is null or p_opening is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':wallet-card-opening:'||p_request_id::text,0));
  select * into v_prior from public.personal_wallet_cards where owner_user_id=v_user and opening_request_id=p_request_id for update;
  if found then
    if v_prior.nickname <> trim(coalesce(p_card->>'nickname','')) or v_prior.issuer <> trim(coalesce(p_card->>'issuer','')) or v_prior.credit_limit <> nullif(p_card->>'credit_limit','')::numeric or v_prior.account_id is distinct from p_existing_account_id then
      raise exception 'Identificador de cadastro reutilizado com dados diferentes.';
    end if;
    return jsonb_build_object('account_id',v_prior.account_id,'card_id',v_prior.id,'replayed',true);
  end if;
  v_limit := coalesce((p_card->>'credit_limit')::numeric,0);
  v_invoice := coalesce((p_opening->>'invoice_amount')::numeric,0);
  v_future := coalesce((p_opening->>'future_amount')::numeric,0);
  if v_invoice < 0 or v_future < 0 or round(v_invoice+v_future,2) > v_limit then raise exception 'A carga inicial excede o limite contratado.'; end if;
  v_created := public.personal_wallet_create_linked_assets(null::jsonb,p_card,p_existing_account_id);
  v_card_id := (v_created->>'card_id')::uuid;
  update public.personal_wallet_cards set opening_request_id=p_request_id where id=v_card_id and owner_user_id=v_user;
  perform public.personal_wallet_set_card_opening_summary(v_card_id,v_limit,v_invoice+v_future,v_invoice,coalesce((p_opening->>'invoice_month')::date,date_trunc('month',current_date)::date),coalesce(p_opening->>'invoice_state','OPEN'),p_request_id);
  return v_created||jsonb_build_object('replayed',false);
end;
$$;


create or replace function private.wallet_card_first_due_date(
 p_card_id uuid,p_expense_date date,p_explicit_due_date date default null
) returns date language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_card public.personal_wallet_cards%rowtype; v_month date;
begin
 if p_card_id is null then return coalesce(p_explicit_due_date,p_expense_date); end if;
 select * into v_card from public.personal_wallet_cards where id=p_card_id;
 v_month:=coalesce(date_trunc('month',p_explicit_due_date)::date,date_trunc('month',p_expense_date)::date);
 if v_card.opening_invoice_month is not null and p_expense_date>=v_card.initial_balance_occurred_at::date then
  if v_card.opening_invoice_state='CLOSED' and v_month<=v_card.opening_invoice_month then return (v_card.opening_invoice_month+interval '1 month')::date; end if;
  if v_card.opening_invoice_state='OPEN' and p_explicit_due_date is null then return greatest(v_month,v_card.opening_invoice_month); end if;
 end if;
 if p_explicit_due_date is not null then return p_explicit_due_date; end if;
 if v_card.closing_day is not null and extract(day from p_expense_date)>v_card.closing_day then v_month:=(v_month+interval '1 month')::date; end if;
 return v_month;
end $$;

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
        or (v_override_id is null and e.entry_type='PURCHASE')
        or (e.entry_type='PURCHASE' and i.opening_invoice_id is distinct from v_override_id
          and exists(select 1 from public.personal_wallet_expenses o where o.id=v_override_id and o.is_opening_summary)))
    order by (e.id=v_override_id) desc,i.installment_number,i.id for update of i
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
  new.used_limit:=round(new.current_bill+v_future+coalesce(new.initial_future_installments_balance,0),2);
  return new;
end;
$$;


alter table public.personal_wallet_statement_rows
 add column if not exists expense_id uuid references public.personal_wallet_expenses(id),
 add column if not exists opening_included boolean;
create unique index if not exists wallet_statement_expense_unique on public.personal_wallet_statement_rows(expense_id) where expense_id is not null;
create or replace function public.personal_wallet_import_card_statement_purchase(
 p_row_id uuid,p_due_month date,p_included_in_opening boolean,p_request_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid:=auth.uid(); r public.personal_wallet_statement_rows%rowtype;
 c public.personal_wallet_cards%rowtype; v_expense uuid; v_override uuid; v_covered numeric; v_month date:=date_trunc('month',p_due_month)::date;
begin
 if v_owner is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
 if p_request_id is null or p_due_month is null or p_included_in_opening is null then raise exception 'Informe o ciclo e a origem do gasto.'; end if;
 select * into r from public.personal_wallet_statement_rows where id=p_row_id and owner_user_id=v_owner and target_kind='CARD' for update;
 if not found then raise exception 'Linha importada nao encontrada.'; end if;
 if r.amount<=0 then raise exception 'Selecione somente compras com valor positivo.'; end if;
 select * into c from public.personal_wallet_cards where id=r.target_id and owner_user_id=v_owner and status='ACTIVE' for update;
 if not found then raise exception 'Cartao nao encontrado.'; end if;
 if r.expense_id is not null then
  if r.opening_included is distinct from p_included_in_opening or not exists(select 1 from public.personal_wallet_expenses where id=r.expense_id and due_date=v_month)
  then raise exception 'Item ja registrado com outro ciclo ou origem. Revise o extrato.'; end if;
  return r.expense_id;
 end if;
 if p_included_in_opening then
  if v_month=c.opening_invoice_month then
   select id into v_override from public.personal_wallet_expenses where card_id=c.id and owner_user_id=v_owner and is_opening_summary and invoice_due_month=v_month and status<>'CANCELED';
   if v_override is null then raise exception 'Nao existe fatura inicial para detalhar neste ciclo.'; end if;
   select coalesce(sum(amount),0) into v_covered from public.personal_wallet_expense_installments where opening_invoice_id=v_override and status<>'CANCELED';
   if v_covered+r.amount>(select amount from public.personal_wallet_expenses where id=v_override) then raise exception 'Os itens superam a fatura inicial. Revise a selecao.'; end if;
  elsif v_month>c.opening_invoice_month then
   if r.amount>coalesce(c.initial_future_installments_balance,0) then raise exception 'Este valor supera os gastos iniciais ainda sem detalhamento.'; end if;
   update public.personal_wallet_cards set initial_future_installments_balance=initial_future_installments_balance-r.amount,
    opening_unallocated_amount=initial_future_installments_balance-r.amount where id=c.id;
  else raise exception 'O ciclo escolhido e anterior a situacao inicial.'; end if;
 end if;
 v_expense:=public.personal_wallet_create_expense(r.description,r.amount,r.category,r.entry_date,v_month,null,c.id,'PENDING',1,null,'Importado do PDF; parcela reconhecida individualmente.');
 update public.personal_wallet_expenses set due_date=v_month,request_id=p_request_id where id=v_expense;
 update public.personal_wallet_expense_installments set due_month=v_month,opening_invoice_id=v_override where expense_id=v_expense;
 update public.personal_wallet_statement_rows set expense_id=v_expense,opening_included=p_included_in_opening where id=r.id;
 perform private.wallet_recalculate_card_position(v_owner,c.id,coalesce(c.opening_invoice_month,v_month));
 return v_expense;
end $$;
revoke all on function public.personal_wallet_import_card_statement_purchase(uuid,date,boolean,uuid) from public,anon;
grant execute on function public.personal_wallet_import_card_statement_purchase(uuid,date,boolean,uuid) to authenticated;

notify pgrst,'reload schema';
commit;

