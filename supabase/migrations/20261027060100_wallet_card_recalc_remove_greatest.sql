begin;

create or replace function private.wallet_recalculate_card_position(
  p_owner_id uuid,
  p_card_id uuid,
  p_competence_month date
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_limit numeric(14,2); v_initial numeric(14,2) := 0; v_month date;
  v_current numeric(14,2) := 0; v_native_future numeric(14,2) := 0;
  v_future numeric(14,2) := 0; v_committed numeric(14,2) := 0; v_free numeric(14,2) := 0;
begin
  v_month := date_trunc('month', coalesce(p_competence_month, current_date))::date;
  select credit_limit, coalesce(initial_future_installments_balance, 0) into v_limit, v_initial
  from public.personal_wallet_cards where id=p_card_id and owner_user_id=p_owner_id for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  v_current := private.wallet_effective_cycle_amount(p_owner_id,p_card_id,v_month);
  select coalesce(round(sum(private.wallet_effective_cycle_amount(p_owner_id,p_card_id,m.due_month)),2),0) into v_native_future
  from (select distinct i.due_month from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id=i.expense_id where e.owner_user_id=p_owner_id and e.card_id=p_card_id and e.status<>'CANCELED' and i.status<>'CANCELED' and i.due_month>v_month) m;
  v_future:=round(v_initial+v_native_future,2); v_committed:=round(v_current+v_future,2);
  v_free:=case when coalesce(v_limit,0)-v_committed<0 then 0 else round(coalesce(v_limit,0)-v_committed,2) end;
  update public.personal_wallet_cards set current_bill=v_current,used_limit=v_committed,available_limit=v_free,opening_unallocated_amount=v_initial,updated_at=now() where id=p_card_id and owner_user_id=p_owner_id;
  return jsonb_build_object('card_id',p_card_id,'due_month',v_month,'current_invoice',v_current,'initial_future_installments_balance',v_initial,'native_future_commitments',v_native_future,'future_commitments',v_future,'committed_limit',v_committed,'free_limit',v_free,'available_limit',v_free);
end;
$$;

commit;
