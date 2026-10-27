begin;

create or replace function private.wallet_card_first_due_date(
  p_card_id uuid,
  p_expense_date date,
  p_explicit_due_date date default null
) returns date
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_closing smallint; v_month date; v_day integer;
begin
  if p_explicit_due_date is not null or p_card_id is null then return coalesce(p_explicit_due_date, p_expense_date); end if;
  select closing_day into v_closing from public.personal_wallet_cards where id=p_card_id;
  if v_closing is null then return p_expense_date; end if;
  v_month := date_trunc('month', p_expense_date)::date;
  v_day := extract(day from p_expense_date)::integer;
  if v_day > v_closing then v_month := (v_month + interval '1 month')::date; end if;
  return v_month;
end;
$$;

create or replace function public.personal_wallet_create_expense(
  p_description text, p_amount numeric, p_category text, p_expense_date date,
  p_due_date date default null, p_account_id uuid default null, p_card_id uuid default null,
  p_status text default 'PENDING', p_installment_count integer default 1,
  p_recurrence text default null, p_notes text default null
) returns uuid
language plpgsql set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid(); v_expense_id uuid := gen_random_uuid();
  v_status text := upper(coalesce(p_status,'PENDING')); v_due date;
  v_base numeric(14,2); v_piece numeric(14,2); v_index integer;
begin
  if v_user_id is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if coalesce(trim(p_description),'')='' or p_amount is null or p_amount<=0 or p_expense_date is null then raise exception 'Dados da despesa invalidos.'; end if;
  if coalesce(p_installment_count,0) not between 1 and 120 then raise exception 'Quantidade de parcelas invalida.'; end if;
  if (p_account_id is null)=(p_card_id is null) then raise exception 'Escolha somente uma conta ou um cartao.'; end if;
  if v_status not in ('PENDING','PAID') then raise exception 'Status inicial invalido.'; end if;
  if p_account_id is not null and not exists(select 1 from public.personal_wallet_accounts where id=p_account_id and owner_user_id=v_user_id) then raise exception 'Conta nao encontrada.'; end if;
  if p_card_id is not null and not exists(select 1 from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_user_id and status='ACTIVE') then raise exception 'Cartao ativo nao encontrado.'; end if;
  if p_card_id is not null then v_status:='PENDING'; end if;
  v_due := case when p_card_id is not null then private.wallet_card_first_due_date(p_card_id,p_expense_date,p_due_date) else coalesce(p_due_date,p_expense_date) end;
  insert into public.personal_wallet_expenses(id,owner_user_id,description,amount,category,expense_date,due_date,account_id,card_id,status,installment_count,recurrence,notes)
  values(v_expense_id,v_user_id,trim(p_description),round(p_amount,2),coalesce(nullif(trim(p_category),''),'Outros'),p_expense_date,v_due,p_account_id,p_card_id,v_status,p_installment_count,nullif(trim(coalesce(p_recurrence,'')),''),nullif(trim(coalesce(p_notes,'')),''));
  v_base:=trunc((round(p_amount,2)*100)/p_installment_count)/100;
  for v_index in 1..p_installment_count loop
    v_piece:=case when v_index=p_installment_count then round(p_amount,2)-v_base*(p_installment_count-1) else v_base end;
    insert into public.personal_wallet_expense_installments(expense_id,owner_user_id,installment_number,due_month,amount,status)
    values(v_expense_id,v_user_id,v_index,(date_trunc('month',v_due)::date+make_interval(months=>v_index-1))::date,v_piece,v_status);
  end loop;
  if p_account_id is not null and v_status='PAID' then
    update public.personal_wallet_accounts set balance=round(balance-p_amount,2),updated_at=now() where id=p_account_id;
  elsif p_card_id is not null then
    update public.personal_wallet_cards set used_limit=round(used_limit+p_amount,2),current_bill=round(current_bill+v_base,2),updated_at=now() where id=p_card_id;
  end if;
  return v_expense_id;
end;
$$;

revoke all on function public.personal_wallet_create_expense(text,numeric,text,date,date,uuid,uuid,text,integer,text,text) from public,anon;
grant execute on function public.personal_wallet_create_expense(text,numeric,text,date,date,uuid,uuid,text,integer,text,text) to authenticated;

create or replace function private.wallet_invoice_cycle_state(
  p_cycle_month date,
  p_closing_day smallint,
  p_due_day smallint,
  p_outstanding numeric,
  p_today date default null
) returns text
language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month',p_cycle_month)::date;
  v_today date := coalesce(p_today,current_date);
  v_closing integer := greatest(1,coalesce(p_closing_day,1));
  v_due integer := greatest(1,coalesce(p_due_day,1));
  v_closing_date date; v_due_month date; v_due_date date;
begin
  v_closing := least(v_closing,extract(day from (v_month + interval '1 month' - interval '1 day'))::integer);
  v_closing_date := v_month + (v_closing - 1);
  v_due_month := case when v_due <= v_closing then (v_month + interval '1 month')::date else v_month end;
  v_due := least(v_due,extract(day from (v_due_month + interval '1 month' - interval '1 day'))::integer);
  v_due_date := v_due_month + (v_due - 1);
  if coalesce(p_outstanding,0) <= 0 then return 'PAID'; end if;
  if v_today <= v_closing_date then return 'OPEN'; end if;
  if v_today <= v_due_date then return 'CLOSED'; end if;
  return 'OVERDUE';
end;
$$;

revoke all on function private.wallet_card_first_due_date(uuid,date,date) from public,anon,authenticated;
revoke all on function private.wallet_invoice_cycle_state(date,smallint,smallint,numeric,date) from public,anon,authenticated;

commit;
