create or replace function public.personal_wallet_create_recurring_obligation(
 p_kind text,p_description text,p_creditor text,p_creditor_type text,p_category text,
 p_amount numeric,p_due_day integer,p_origin_type text,p_origin_id uuid,p_start_month date
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid:=auth.uid();v_id uuid;
begin
 if v_owner is null or not public.is_platform_super_admin() then raise exception 'Sem acesso';end if;
 if p_kind not in ('EXPENSE','DEBT') or p_creditor_type not in ('PERSON','COMPANY')
   or p_origin_type not in ('ACCOUNT','CARD') then raise exception 'Dados inválidos';end if;
 if nullif(trim(p_description),'') is null or nullif(trim(p_creditor),'') is null
 or nullif(trim(p_category),'') is null or p_amount is null or p_amount<=0
 or round(p_amount,2)<>p_amount or p_due_day not between 1 and 31
 or p_start_month is null or p_start_month<>date_trunc('month',p_start_month)::date
 or p_start_month<date_trunc('month',current_date)::date then raise exception 'Valores inválidos';end if;
 if p_origin_type='ACCOUNT' and not exists(select 1 from public.personal_wallet_accounts
 where id=p_origin_id and owner_user_id=v_owner) then raise exception 'Conta não autorizada';end if;
 if p_origin_type='CARD' and not exists(select 1 from public.personal_wallet_cards
 where id=p_origin_id and owner_user_id=v_owner and status='ACTIVE') then raise exception 'Cartão não autorizado';end if;
 insert into public.personal_wallet_recurring_obligations(
 owner_user_id,kind,description,creditor_name,creditor_type,category,amount,due_day,
 origin_type,origin_account_id,origin_card_id,start_month)
 values(v_owner,p_kind,trim(p_description),trim(p_creditor),p_creditor_type,
 trim(p_category),p_amount,p_due_day,p_origin_type,
 case when p_origin_type='ACCOUNT' then p_origin_id end,
 case when p_origin_type='CARD' then p_origin_id end,p_start_month)
 returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.personal_wallet_create_recurring_obligation(text,text,text,text,text,numeric,integer,text,uuid,date) from public,anon;
grant execute on function public.personal_wallet_create_recurring_obligation(text,text,text,text,text,numeric,integer,text,uuid,date) to authenticated;
create or replace function public.personal_wallet_generate_recurring_obligations(p_month date,p_months int default 3)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid:=auth.uid();v_month date;v_template record;v_due date;v_payable uuid;v_created int:=0;i int;
begin
 if v_owner is null or not public.is_platform_super_admin() then raise exception 'Sem acesso';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date
 or p_month<date_trunc('month',current_date)::date or p_months not between 1 and 12
 then raise exception 'Período inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||'recurring',1817));
 for i in 0..p_months-1 loop
  v_month:=(p_month+make_interval(months=>i))::date;
  for v_template in select * from public.personal_wallet_recurring_obligations
  where owner_user_id=v_owner and active and start_month<=v_month order by id loop
   if exists(select 1 from public.personal_wallet_recurring_obligation_issues
    where owner_user_id=v_owner and obligation_id=v_template.id and reference_month=v_month) then continue;end if;
   v_due:=v_month+(least(v_template.due_day,
      extract(day from (v_month+interval '1 month')::date-1)::int)-1);
   insert into public.personal_wallet_payables(owner_user_id,creditor_name,creditor_type,
   description,category,amount,total_amount,outstanding_balance,due_date,status,
   origin_type,origin_account_id,origin_card_id)
   values(v_owner,v_template.creditor_name,v_template.creditor_type,v_template.description,
   v_template.category,v_template.amount,v_template.amount,v_template.amount,v_due,'PENDING',
   v_template.origin_type,v_template.origin_account_id,v_template.origin_card_id)
   returning id into v_payable;
   insert into public.personal_wallet_recurring_obligation_issues(
   owner_user_id,obligation_id,reference_month,payable_id)
   values(v_owner,v_template.id,v_month,v_payable);
   v_created:=v_created+1;
  end loop;
 end loop;
 return v_created;
end;$$;
revoke all on function public.personal_wallet_generate_recurring_obligations(date,integer) from public,anon;
grant execute on function public.personal_wallet_generate_recurring_obligations(date,integer) to authenticated;
create or replace function public.personal_wallet_set_recurring_obligation_active(p_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_platform_super_admin() then raise exception 'Sem acesso';end if;
 update public.personal_wallet_recurring_obligations set active=p_active
 where id=p_id and owner_user_id=auth.uid();
 if not found then raise exception 'Recorrência inexistente';end if;
end;$$;
revoke all on function public.personal_wallet_set_recurring_obligation_active(uuid,boolean) from public,anon;
grant execute on function public.personal_wallet_set_recurring_obligation_active(uuid,boolean) to authenticated;
