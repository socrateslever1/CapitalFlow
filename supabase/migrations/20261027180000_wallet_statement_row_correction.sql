create or replace function public.personal_wallet_delete_statement_row(p_row_id uuid)
returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_user uuid := auth.uid(); v_row public.personal_wallet_statement_rows%rowtype;
begin
  if v_user is null then raise exception 'Acesso nao autorizado.'; end if;
  select * into v_row from public.personal_wallet_statement_rows where id=p_row_id and owner_user_id=v_user for update;
  if not found then raise exception 'Linha do extrato nao encontrada.'; end if;
  if v_row.expense_id is not null then raise exception 'Esta linha esta vinculada a uma despesa. Exclua a despesa pelo extrato da fatura.'; end if;
  delete from public.personal_wallet_statement_rows where id=p_row_id and owner_user_id=v_user;
end;
$$;
revoke all on function public.personal_wallet_delete_statement_row(uuid) from public,anon;
grant execute on function public.personal_wallet_delete_statement_row(uuid) to authenticated;

notify pgrst, 'reload schema';
