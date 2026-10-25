-- CapitalFlow wallet: safe metadata-only card editing. Never update ledger,
-- existing installment balances, receipt engine V4, payments or statements.
create or replace function public.personal_wallet_update_card_metadata(
  p_card_id uuid,p_nickname text,p_issuer text,p_brand text,p_account_id uuid,
  p_limit numeric,p_closing_day integer,p_due_day integer,p_status text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid := auth.uid(); v_card public.personal_wallet_cards%rowtype;
begin
 if v_owner is null or not public.is_platform_super_admin() then raise exception 'Sem permissão.'; end if;
 if p_card_id is null then raise exception 'Cartão não informado.'; end if;
 if char_length(trim(coalesce(p_nickname,''))) not between 1 and 120
    or char_length(trim(coalesce(p_issuer,''))) not between 1 and 120 then raise exception 'Identificação inválida.'; end if;
 if p_brand is not null and char_length(p_brand)>80 then raise exception 'Bandeira inválida.'; end if;
 if p_limit is null or p_limit < 0 or p_limit <> round(p_limit,2) then raise exception 'Limite inválido.'; end if;
 if p_closing_day is not null and p_closing_day not between 1 and 31 then raise exception 'Fechamento inválido.'; end if;
 if p_due_day is not null and p_due_day not between 1 and 31 then raise exception 'Vencimento inválido.'; end if;
 if p_status not in ('ACTIVE','BLOCKED','CANCELED') then raise exception 'Status inválido.'; end if;
 select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner for update;
 if not found then raise exception 'Cartão não encontrado.'; end if;
 if p_account_id is not null and not exists (
    select 1 from public.personal_wallet_accounts where id=p_account_id and owner_user_id=v_owner
 ) then raise exception 'Conta vinculada não autorizada.'; end if;
 if p_limit < greatest(v_card.used_limit,v_card.current_bill) then
    raise exception 'Limite inferior ao valor utilizado ou à fatura atual.'; end if;
 if p_status='CANCELED' and
    (v_card.used_limit>0 or v_card.current_bill>0 or exists (
      select 1 from public.personal_wallet_expenses e where e.card_id=p_card_id and e.status='PENDING'
    )) then raise exception 'Quite as obrigações pendentes antes de arquivar.'; end if;
 update public.personal_wallet_cards
   set nickname=trim(p_nickname),issuer=trim(p_issuer),brand=nullif(trim(coalesce(p_brand,'')),''),
     account_id=p_account_id,credit_limit=p_limit,closing_day=p_closing_day,
     due_day=p_due_day,status=p_status,updated_at=now()
 where id=p_card_id and owner_user_id=v_owner;
end;
$$;
revoke all on function public.personal_wallet_update_card_metadata(uuid,text,text,text,uuid,numeric,integer,integer,text) from public,anon;
grant execute on function public.personal_wallet_update_card_metadata(uuid,text,text,text,uuid,numeric,integer,integer,text) to authenticated;
