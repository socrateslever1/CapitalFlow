alter table public.personal_wallet_statement_rows
  add column if not exists installment_number smallint,
  add column if not exists installment_total smallint;

alter table public.personal_wallet_statement_rows
  drop constraint if exists wallet_statement_installment_check;
alter table public.personal_wallet_statement_rows
  add constraint wallet_statement_installment_check check (
    (installment_number is null and installment_total is null)
    or (installment_number between 1 and 999 and installment_total between 2 and 999 and installment_number <= installment_total)
  );

create or replace function public.personal_wallet_record_statement_row(
 p_target_kind text,p_target_id uuid,p_document_hash text,p_row_key text,
 p_entry_date date,p_description text,p_amount numeric,p_category text,
 p_installment_number smallint,p_installment_total smallint
) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_user uuid := auth.uid(); v_id uuid; v_kind text:=upper(btrim(coalesce(p_target_kind,'')));
begin
 if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
 if v_kind not in('ACCOUNT','CARD') or p_target_id is null then raise exception 'Destino invalido.'; end if;
 if p_document_hash is null or p_document_hash !~ '^[0-9a-f]{64}$' or char_length(coalesce(p_row_key,'')) not between 1 and 160 then raise exception 'Referencia de documento invalida.'; end if;
 if p_entry_date is null or char_length(btrim(coalesce(p_description,''))) not between 1 and 240 or p_amount is null or p_amount=0 or p_amount<>round(p_amount,2) then raise exception 'Linha do extrato invalida.'; end if;
 if p_installment_number is not null and (p_installment_total is null or p_installment_number < 1 or p_installment_total < 2 or p_installment_number > p_installment_total) then raise exception 'Parcela invalida.'; end if;
 if v_kind='ACCOUNT' then perform 1 from public.personal_wallet_accounts where id=p_target_id and owner_user_id=v_user;
 else perform 1 from public.personal_wallet_cards where id=p_target_id and owner_user_id=v_user; end if;
 if not found then raise exception 'Destino nao encontrado ou nao autorizado.'; end if;
 insert into public.personal_wallet_statement_rows(owner_user_id,target_kind,target_id,document_hash,row_key,entry_date,description,amount,category,installment_number,installment_total)
 values(v_user,v_kind,p_target_id,p_document_hash,p_row_key,p_entry_date,btrim(p_description),p_amount,coalesce(nullif(btrim(coalesce(p_category,'')),''),'Outros'),p_installment_number,p_installment_total)
 on conflict(owner_user_id,target_kind,target_id,document_hash,row_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.personal_wallet_statement_rows where owner_user_id=v_user and target_kind=v_kind and target_id=p_target_id and document_hash=p_document_hash and row_key=p_row_key; end if;
 return v_id;
end;
$$;
revoke all on function public.personal_wallet_record_statement_row(text,uuid,text,text,date,text,numeric,text,smallint,smallint) from public,anon;
grant execute on function public.personal_wallet_record_statement_row(text,uuid,text,text,date,text,numeric,text,smallint,smallint) to authenticated;
