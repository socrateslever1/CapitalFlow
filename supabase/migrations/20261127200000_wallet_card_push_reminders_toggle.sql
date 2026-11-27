-- Liga/desliga o aviso de fatura no celular por cartão (coluna criada em 20261127180000).
create or replace function public.personal_wallet_set_card_push_reminders(p_card_id uuid, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_card_id is null or p_enabled is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  update public.personal_wallet_cards set push_reminders = p_enabled, updated_at = now()
   where id = p_card_id and owner_user_id = v_user;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  return p_enabled;
end;
$$;

revoke all on function public.personal_wallet_set_card_push_reminders(uuid, boolean) from public, anon;
grant execute on function public.personal_wallet_set_card_push_reminders(uuid, boolean) to authenticated;
