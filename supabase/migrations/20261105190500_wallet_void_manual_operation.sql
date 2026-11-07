-- Anulação de lançamento manual com compensação atômica e trilha de auditoria.
-- Operações vinculadas a contratos, cobranças, cartão ou transferências não são elegíveis.
alter table public.personal_wallet_account_operations
  add column if not exists voided_at timestamptz;
alter table public.personal_wallet_account_operations
  add column if not exists voids_operation_id uuid
    references public.personal_wallet_account_operations(id) on delete restrict;
create unique index if not exists wallet_account_operation_single_void_idx
  on public.personal_wallet_account_operations(voids_operation_id)
  where voids_operation_id is not null;

create or replace function public.personal_wallet_void_manual_operation(p_operation_id uuid)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_original public.personal_wallet_account_operations%rowtype;
  v_reversal uuid;
  v_type text;
begin
  if v_user is null or not public.is_platform_super_admin() or p_operation_id is null then
    raise exception 'Acesso não autorizado.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));

  select * into v_original
  from public.personal_wallet_account_operations
  where id=p_operation_id and owner_user_id=v_user
  for update;

  if not found then raise exception 'Lançamento não encontrado nesta carteira.'; end if;
  if v_original.voided_at is not null then raise exception 'Lançamento já anulado.'; end if;
  if v_original.voids_operation_id is not null then
    raise exception 'Uma compensação não pode ser anulada novamente.';
  end if;
  if v_original.operation_type not in ('EXPENSE','INCOME','RECEIPT')
      or v_original.contract_id is not null
      or v_original.installment_id is not null
      or v_original.charge_id is not null
      or v_original.category in ('Saldo inicial','Ajuste de Saldo','Estorno de lançamento')
      or (v_original.from_account_id is null and v_original.to_account_id is null)
      or (v_original.from_account_id is not null and v_original.to_account_id is not null) then
    raise exception 'Este registro exige procedimento próprio de estorno.';
  end if;

  v_type := case when v_original.operation_type='EXPENSE' then 'INCOME' else 'EXPENSE' end;
  -- A função já existente valida propriedade, limite e saldo e altera a conta atomicamente.
  v_reversal := public.personal_wallet_record_account_operation(
    v_type,
    case when v_type='EXPENSE' then v_original.to_account_id else null end,
    case when v_type='INCOME' then v_original.from_account_id else null end,
    v_original.amount,
    left('Estorno: ' || v_original.description,240),
    'Estorno de lançamento',current_date,gen_random_uuid()
  );

  update public.personal_wallet_account_operations
    set voided_at=now()
  where id=p_operation_id and owner_user_id=v_user and voided_at is null;
  if not found then raise exception 'Não foi possível confirmar a anulação.'; end if;

  update public.personal_wallet_account_operations
    set voided_at=now(), voids_operation_id=p_operation_id
  where id=v_reversal and owner_user_id=v_user;
  if not found then raise exception 'Compensação não confirmada.'; end if;
  return v_reversal;
end;
$$;

revoke all on function public.personal_wallet_void_manual_operation(uuid) from public,anon;
grant execute on function public.personal_wallet_void_manual_operation(uuid) to authenticated;
-- Mantêm-se os privilégios SELECT existentes e a restrição RLS; nenhuma escrita direta foi concedida.
