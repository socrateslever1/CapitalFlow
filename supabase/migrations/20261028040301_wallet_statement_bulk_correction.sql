create or replace function public.personal_wallet_delete_statement_row(p_row_id uuid)
returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_user uuid := auth.uid(); v_row public.personal_wallet_statement_rows%rowtype;
begin
  if v_user is null then raise exception 'Acesso nao autorizado.'; end if;
  select * into v_row from public.personal_wallet_statement_rows
  where id=p_row_id and owner_user_id=v_user for update;
  if not found then raise exception 'Linha do extrato nao encontrada.'; end if;
  if v_row.expense_id is not null then
    raise exception 'Esta linha esta vinculada a uma despesa. Exclua pelo extrato da fatura.';
  end if;
  delete from public.personal_wallet_statement_rows where id=p_row_id and owner_user_id=v_user;
end;
$$;

create or replace function public.personal_wallet_delete_statement_rows(p_row_ids uuid[])
returns integer
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.personal_wallet_statement_rows%rowtype;
  v_deleted integer := 0;
begin
  if v_user is null then raise exception 'Acesso nao autorizado.'; end if;
  if coalesce(array_length(p_row_ids, 1), 0) = 0 then return 0; end if;
  for v_row in
    select * from public.personal_wallet_statement_rows
    where id = any(p_row_ids) and owner_user_id = v_user
    for update
  loop
    if v_row.expense_id is not null then
      raise exception 'A selecao contem item vinculado a uma despesa. Exclua-o pelo extrato da fatura.';
    end if;
    delete from public.personal_wallet_statement_rows where id=v_row.id and owner_user_id=v_user;
    v_deleted := v_deleted + 1;
  end loop;
  return v_deleted;
end;
$$;

revoke all on function public.personal_wallet_delete_statement_row(uuid) from public,anon;
revoke all on function public.personal_wallet_delete_statement_rows(uuid[]) from public,anon;
grant execute on function public.personal_wallet_delete_statement_row(uuid) to authenticated;
grant execute on function public.personal_wallet_delete_statement_rows(uuid[]) to authenticated;

notify pgrst, 'reload schema';
