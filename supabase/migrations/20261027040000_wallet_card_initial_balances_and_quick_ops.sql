begin;

alter table public.personal_wallet_accounts
  drop constraint if exists personal_wallet_accounts_account_type_check;
alter table public.personal_wallet_accounts
  add constraint personal_wallet_accounts_account_type_check
  check (account_type in ('CHECKING','PAYMENT','SAVINGS','CASH','INVESTMENT'));

alter table public.personal_wallet_cards
  add column if not exists initial_future_installments_balance numeric(14,2) not null default 0,
  add column if not exists initial_balance_occurred_at timestamptz,
  add column if not exists initial_balance_requests jsonb not null default '{}'::jsonb,
  add column if not exists opening_unallocated_amount numeric(14,2) not null default 0;

alter table public.personal_wallet_cards
  drop constraint if exists personal_wallet_cards_initial_future_nonnegative;
alter table public.personal_wallet_cards
  add constraint personal_wallet_cards_initial_future_nonnegative
  check (initial_future_installments_balance >= 0 and opening_unallocated_amount >= 0);

create index if not exists idx_wallet_cards_initial_balance_requests
  on public.personal_wallet_cards using gin(initial_balance_requests)
  where initial_balance_requests <> '{}'::jsonb;

-- Sobrecarga idempotente para lançamentos rápidos, preservando a assinatura legada.
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

create or replace function private.wallet_recalculate_card_position(
  p_owner_id uuid, p_card_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_limit numeric(14,2); v_initial numeric(14,2) := 0; v_current_month date;
  v_current numeric(14,2) := 0; v_native_future numeric(14,2) := 0;
  v_future numeric(14,2) := 0; v_committed numeric(14,2) := 0; v_free numeric(14,2) := 0;
begin
  select credit_limit, greatest(coalesce(initial_future_installments_balance,0), coalesce(opening_unallocated_amount,0))
    into v_limit, v_initial
  from public.personal_wallet_cards where id=p_card_id and owner_user_id=p_owner_id for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;

  with months as (
    select distinct i.due_month
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.owner_user_id=p_owner_id and e.card_id=p_card_id
      and e.status <> 'CANCELED' and i.status <> 'CANCELED'
  ) select min(m.due_month) into v_current_month
    from months m where private.wallet_effective_cycle_amount(p_owner_id,p_card_id,m.due_month)>0;

  if v_current_month is not null then
    v_current := private.wallet_effective_cycle_amount(p_owner_id,p_card_id,v_current_month);
    with months as (
      select distinct i.due_month
      from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id=i.expense_id
      where e.owner_user_id=p_owner_id and e.card_id=p_card_id
        and e.status <> 'CANCELED' and i.status <> 'CANCELED' and i.due_month>v_current_month
    ) select coalesce(round(sum(private.wallet_effective_cycle_amount(p_owner_id,p_card_id,m.due_month)),2),0)
      into v_native_future from months m;
  end if;

  v_future := round(v_initial+v_native_future,2);
  v_committed := round(v_current+v_future,2);
  v_free := greatest(0,round(coalesce(v_limit,0)-v_committed,2));
  update public.personal_wallet_cards
    set current_bill=v_current, used_limit=v_committed,
        available_limit=v_free, initial_future_installments_balance=v_initial,
        opening_unallocated_amount=v_initial, updated_at=now()
    where id=p_card_id and owner_user_id=p_owner_id;
  return jsonb_build_object('card_id',p_card_id,'due_month',v_current_month,
    'current_invoice',v_current,'initial_future_installments_balance',v_initial,
    'native_future_commitments',v_native_future,'future_commitments',v_future,
    'committed_limit',v_committed,'free_limit',v_free,'available_limit',v_free);
end;
$$;
revoke all on function private.wallet_recalculate_card_position(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.personal_wallet_set_card_initial_balances(
  p_card_id uuid, p_credit_limit numeric, p_current_invoice numeric,
  p_future_commitments numeric, p_due_month date, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid:=auth.uid(); v_card public.personal_wallet_cards%rowtype;
  v_month date:=date_trunc('month',coalesce(p_due_month,current_date))::date;
  v_limit numeric(14,2); v_invoice numeric(14,2); v_future numeric(14,2);
  v_payload jsonb; v_position jsonb; v_override uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado a Carteira.'; end if;
  if p_card_id is null or p_request_id is null then raise exception 'Cartao e chave de requisicao sao obrigatorios.'; end if;
  if p_credit_limit is null or p_credit_limit<0 or p_credit_limit<>round(p_credit_limit,2) then raise exception 'Limite total invalido.'; end if;
  if p_current_invoice is null or p_current_invoice<0 or p_current_invoice<>round(p_current_invoice,2) then raise exception 'Fatura atual invalida.'; end if;
  if p_future_commitments is null or p_future_commitments<0 or p_future_commitments<>round(p_future_commitments,2) then raise exception 'Compromissos futuros invalidos.'; end if;
  v_limit:=round(p_credit_limit,2); v_invoice:=round(p_current_invoice,2); v_future:=round(p_future_commitments,2);
  if round(v_invoice+v_future,2)>v_limit then raise exception 'Fatura atual mais compromissos futuros excedem o limite.'; end if;
  v_payload:=jsonb_build_object('credit_limit',v_limit,'current_invoice',v_invoice,'future_commitments',v_future,'due_month',v_month);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':card-initial-balances:'||p_card_id::text,0));
  select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_user and status='ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado ou acesso nao autorizado.'; end if;
  if v_card.initial_balance_requests ? p_request_id::text then
    if v_card.initial_balance_requests->p_request_id::text <> v_payload then raise exception 'Chave reutilizada com parametros diferentes.'; end if;
    return private.wallet_recalculate_card_position(v_user,p_card_id)||jsonb_build_object('replayed',true);
  end if;
  update public.personal_wallet_cards set credit_limit=v_limit,
    initial_future_installments_balance=v_future, opening_unallocated_amount=v_future,
    initial_balance_occurred_at=coalesce(initial_balance_occurred_at,now()),
    initial_balance_requests=initial_balance_requests||jsonb_build_object(p_request_id::text,v_payload), updated_at=now()
    where id=p_card_id and owner_user_id=v_user;
  if v_invoice>0 then
    v_override:=md5('card_initial_invoice:'||p_request_id::text)::uuid;
    perform public.personal_wallet_set_monthly_invoice_override(p_card_id,v_month,v_invoice,v_override);
  end if;
  v_position:=private.wallet_recalculate_card_position(v_user,p_card_id);
  return v_position||jsonb_build_object('replayed',false);
end;
$$;
revoke all on function public.personal_wallet_set_card_initial_balances(uuid,numeric,numeric,numeric,date,uuid) from public,anon;
grant execute on function public.personal_wallet_set_card_initial_balances(uuid,numeric,numeric,numeric,date,uuid) to authenticated;

commit;
