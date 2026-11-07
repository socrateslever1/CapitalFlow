-- Vínculo informativo e selecionável entre fonte de Capital e recurso da Carteira.
-- NÃO modifica fontes.balance, saldo de contas, limite de cartão, ledger nem contratos.
create table if not exists public.capital_source_wallet_references (
  source_id uuid primary key references public.fontes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('ACCOUNT','CARD')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, target_kind, target_id)
);

create index if not exists capital_source_wallet_references_owner_idx
  on public.capital_source_wallet_references(owner_user_id);

alter table public.capital_source_wallet_references enable row level security;
revoke all on public.capital_source_wallet_references from public, anon, authenticated;
grant select on public.capital_source_wallet_references to authenticated;

drop policy if exists capital_source_wallet_references_owner_read on public.capital_source_wallet_references;
create policy capital_source_wallet_references_owner_read
  on public.capital_source_wallet_references for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and public.is_platform_super_admin()
    and exists (
      select 1 from public.fontes f
      join public.perfis p on p.id = f.profile_id
      where f.id = source_id and f.archived_at is null
        and (p.user_id = (select auth.uid()) or p.id = (select auth.uid()))
    )
  );

-- Alterações exclusivamente por RPC, com validação de propriedade nos dois lados.
create or replace function public.capital_source_set_wallet_reference(
  p_source_id uuid,
  p_target_kind text,
  p_target_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_platform_super_admin() then
    raise exception 'Somente o administrador principal pode configurar a origem do capital.';
  end if;
  if p_source_id is null then
    raise exception 'Selecione uma fonte de capital.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 39247));

  perform 1 from public.fontes f
  join public.perfis p on p.id = f.profile_id
  where f.id = p_source_id and f.archived_at is null
    and (p.user_id = v_uid or p.id = v_uid)
  for update of f;
  if not found then
    raise exception 'Fonte indisponível ou não autorizada.';
  end if;

  if p_target_kind is null and p_target_id is null then
    delete from public.capital_source_wallet_references
      where source_id = p_source_id and owner_user_id = v_uid;
    return true;
  end if;

  if p_target_kind is null or p_target_id is null
      or p_target_kind not in ('ACCOUNT','CARD') then
    raise exception 'Selecione uma conta ou cartão válido.';
  end if;

  if p_target_kind = 'ACCOUNT' then
    perform 1 from public.personal_wallet_accounts a
      where a.id = p_target_id and a.owner_user_id = v_uid
        and a.archived_at is null and a.capital_source_id is null
      for share;
    if not found then
      raise exception 'Conta indisponível, de outro titular ou já integrada automaticamente.';
    end if;
  else
    perform 1 from public.personal_wallet_cards c
      where c.id = p_target_id and c.owner_user_id = v_uid
        and c.status = 'ACTIVE'
      for share;
    if not found then
      raise exception 'Cartão indisponível ou de outro titular.';
    end if;
  end if;

  insert into public.capital_source_wallet_references
    (source_id, owner_user_id, target_kind, target_id)
  values (p_source_id, v_uid, p_target_kind, p_target_id)
  on conflict (source_id) do update
    set target_kind = excluded.target_kind,
        target_id = excluded.target_id,
        updated_at = now()
    where public.capital_source_wallet_references.owner_user_id = v_uid;
  if not found then
    raise exception 'Vínculo não autorizado.';
  end if;
  return true;
exception when unique_violation then
  raise exception 'Esta conta ou cartão já está selecionado por outra fonte.';
end $$;

revoke all on function public.capital_source_set_wallet_reference(uuid,text,uuid)
  from public, anon;
grant execute on function public.capital_source_set_wallet_reference(uuid,text,uuid)
  to authenticated;
