begin;

create or replace function public.personal_wallet_create_expense(
  p_description text, p_amount numeric, p_category text, p_expense_date date,
  p_due_date date, p_account_id uuid, p_card_id uuid, p_status text,
  p_installment_count integer, p_recurrence text, p_notes text, p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_existing uuid;
begin
  if v_user is null or not public.is_platform_super_admin() or p_request_id is null then raise exception 'Acesso nao autorizado.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':expense:'||p_request_id::text,0));
  select id into v_existing from public.personal_wallet_expenses where owner_user_id=v_user and request_id=p_request_id for update;
  if v_existing is not null then return v_existing; end if;
  v_id:=public.personal_wallet_create_expense(p_description,p_amount,p_category,p_expense_date,p_due_date,p_account_id,p_card_id,p_status,p_installment_count,p_recurrence,p_notes);
  update public.personal_wallet_expenses set request_id=p_request_id where id=v_id and owner_user_id=v_user;
  return v_id;
end;
$$;
revoke all on function public.personal_wallet_create_expense(text,numeric,text,date,date,uuid,uuid,text,integer,text,text,uuid) from public,anon;
grant execute on function public.personal_wallet_create_expense(text,numeric,text,date,date,uuid,uuid,text,integer,text,text,uuid) to authenticated;

commit;
