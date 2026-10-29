-- Condicoes especiais de pagamento: apenas o historico USE/PARTIAL
-- constitui o fato financeiro; uma historia equivale a um credito.
-- A mesma chave de idempotencia impede contabilizacao duplicada.
create or replace function public.wallet_sync_special_payment_offer()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_account uuid;
  v_source uuid;
  v_amount numeric;
  v_request uuid;
  v_written uuid;
begin
  if new.payment_id is null or new.action not in ('USED','PARTIAL') then
    return new;
  end if;
  select coalesce(p.user_id,p.id) into v_owner
  from public.perfis p where p.id = new.profile_id;
  if v_owner is null or not exists (
    select 1 from public.platform_admins a
    where a.user_id = v_owner and a.role = 'SUPER_ADMIN'
  ) then return new; end if;

  v_amount := case
    when new.action = 'PARTIAL' then
      round(coalesce((new.metadata->>'partial_paid')::numeric,0),2)
    else round(coalesce(new.offered_amount,0),2)
  end;
  if v_amount <= 0 then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,19283));
  select r.account_id into v_account
  from public.wallet_receipt_destinations r
  where r.idempotency_key = new.payment_id
    and r.owner_user_id = v_owner and r.loan_id = new.loan_id;
  if v_account is null then
    select c.source_id into v_source
    from public.contratos c where c.id = new.loan_id;
    select a.id into v_account
    from public.personal_wallet_accounts a
    where a.owner_user_id = v_owner and a.capital_source_id = v_source
      and a.archived_at is null;
  end if;
  if v_account is null then return new; end if;
  perform 1 from public.personal_wallet_accounts a
  where a.id=v_account and a.owner_user_id=v_owner and a.archived_at is null for update;
  if not found then raise exception 'Conta de recebimento indisponivel.'; end if;

  v_request := md5('wallet_payment_offer:'||new.payment_id::text)::uuid;
  insert into public.personal_wallet_account_operations (
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,contract_id,installment_id,occurred_at
  ) values (
    v_owner,v_request,'LOAN_REPAYMENT',null,v_account,v_amount,
    case when new.action = 'PARTIAL' then 'Recebimento parcial de condicao especial'
      else 'Recebimento de condicao especial' end,
    'Recebimento de empréstimo',current_date,new.loan_id,new.installment_id,now()
  ) on conflict (owner_user_id,request_id) do nothing returning id into v_written;
  if v_written is not null then
    update public.personal_wallet_accounts
    set balance=round(coalesce(balance,0)+v_amount,2),updated_at=now()
    where id=v_account and owner_user_id=v_owner;
  end if;
  return new;
end
$$;
revoke all on function public.wallet_sync_special_payment_offer() from public,anon,authenticated;
drop trigger if exists trg_wallet_sync_special_payment_offer on public.installment_payment_offer_history;
create trigger trg_wallet_sync_special_payment_offer
after insert on public.installment_payment_offer_history
for each row execute function public.wallet_sync_special_payment_offer();
