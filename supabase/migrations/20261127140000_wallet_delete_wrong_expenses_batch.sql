-- Excluir vários lançamentos da fatura de uma vez: tudo numa única transação.
-- Reaproveita personal_wallet_delete_wrong_expense para cada compra (mesmas travas e recusas);
-- se uma não puder ser apagada, nada é apagado. Repetição da mesma requisição não duplica.

create or replace function public.personal_wallet_delete_wrong_expenses(p_expense_ids uuid[], p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_id uuid;
  v_count integer := 0;
  v_cards uuid[] := '{}';
  v_result jsonb;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_request_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  -- Ordem estável por cartão e id: lotes concorrentes travam os cartões na mesma ordem.
  select array_agg(d.x order by e.card_id nulls last, d.x) into v_ids
    from (select distinct x from unnest(coalesce(p_expense_ids, '{}')) x where x is not null) d
    left join public.personal_wallet_expenses e on e.id = d.x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Selecione ao menos um lancamento.'; end if;
  if array_length(v_ids, 1) > 200 then raise exception 'Selecione no maximo 200 lancamentos por vez.'; end if;
  foreach v_id in array v_ids loop
    begin
      v_result := public.personal_wallet_delete_wrong_expense(v_id, md5(p_request_id::text || ':' || v_id::text)::uuid);
    exception when others then
      raise exception 'Nada foi apagado. Um dos lancamentos nao pode ser excluido: %', sqlerrm;
    end;
    v_count := v_count + 1;
    if v_result ? 'card_id' and not ((v_result ->> 'card_id')::uuid = any(v_cards)) then
      v_cards := v_cards || (v_result ->> 'card_id')::uuid;
    end if;
  end loop;
  return jsonb_build_object('deleted', v_count, 'card_ids', to_jsonb(v_cards));
end;
$$;

revoke all on function public.personal_wallet_delete_wrong_expenses(uuid[], uuid) from public, anon;
grant execute on function public.personal_wallet_delete_wrong_expenses(uuid[], uuid) to authenticated;
