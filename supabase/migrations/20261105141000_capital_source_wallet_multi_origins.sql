-- Vínculos múltiplos e opcionais por fonte; preservar os vínculos preexistentes.
-- Acesso fixo ao único SUPER_ADMIN existente na implantação; novos administradores
-- não recebem este módulo automaticamente. Sem identificar o usuário no frontend.
create table if not exists public.capital_source_wallet_origin_access (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.capital_source_wallet_origin_access enable row level security;
revoke all on public.capital_source_wallet_origin_access from public,anon,authenticated;

insert into public.capital_source_wallet_origin_access(owner_user_id)
select pa.user_id from public.platform_admins pa where pa.role='SUPER_ADMIN'
  and (select count(*) from public.platform_admins where role='SUPER_ADMIN')=1
on conflict do nothing;

create or replace function public.can_manage_capital_source_wallet_origins()
returns boolean language sql stable security definer set search_path=public,pg_temp as $guard$
  select auth.uid() is not null
    and public.is_platform_super_admin()
    and exists(
      select 1 from public.capital_source_wallet_origin_access a
      where a.owner_user_id=auth.uid()
    )
$guard$;
revoke all on function public.can_manage_capital_source_wallet_origins() from public,anon;
grant execute on function public.can_manage_capital_source_wallet_origins() to authenticated;

drop policy if exists capital_source_wallet_references_owner_read
  on public.capital_source_wallet_references;
create policy capital_source_wallet_references_owner_read
  on public.capital_source_wallet_references for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and public.can_manage_capital_source_wallet_origins()
    and exists (
      select 1 from public.fontes f join public.perfis p on p.id=f.profile_id
      where f.id=source_id and f.archived_at is null
        and (p.user_id=(select auth.uid()) or p.id=(select auth.uid()))
    )
  );

-- Nenhuma movimentação financeira, nem ajuste de saldo ou de limite.
alter table public.capital_source_wallet_references
  drop constraint if exists capital_source_wallet_references_pkey;
alter table public.capital_source_wallet_references
  add constraint capital_source_wallet_references_pkey primary key (source_id, target_kind, target_id);
alter table public.capital_source_wallet_references
  add column if not exists allocated_amount numeric(14,2);
alter table public.capital_source_wallet_references
  drop constraint if exists capital_source_wallet_references_allocated_nonnegative;
alter table public.capital_source_wallet_references
  add constraint capital_source_wallet_references_allocated_nonnegative
  check (allocated_amount is null or allocated_amount >= 0);

-- Execução única e atômica: primeiro valida todas as origens, depois substitui.
create or replace function public.capital_source_replace_wallet_origins(
  p_source_id uuid, p_origins jsonb
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_origin jsonb;
  v_kind text;
  v_target uuid;
  v_amount numeric(14,2);
  v_raw_amount text;
  v_count integer := 0;
begin
  if v_uid is null or not public.can_manage_capital_source_wallet_origins() then
    raise exception 'Somente o administrador principal pode configurar as origens.';
  end if;
  if p_source_id is null or p_origins is null or jsonb_typeof(p_origins)<>'array'
      or jsonb_array_length(p_origins)>32 then
    raise exception 'Informe uma lista válida de até 32 origens.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,39247));
  perform 1 from public.fontes f join public.perfis p on p.id=f.profile_id
    where f.id=p_source_id and f.archived_at is null
      and (p.user_id=v_uid or p.id=v_uid)
    for update of f;
  if not found then raise exception 'Fonte indisponível ou não autorizada.'; end if;

  -- A exclusão é transacional; qualquer falha de validação desfaz tudo.
  delete from public.capital_source_wallet_references
    where source_id=p_source_id and owner_user_id=v_uid;

  for v_origin in select value from jsonb_array_elements(p_origins) loop
    if jsonb_typeof(v_origin)<>'object' then
      raise exception 'Formato de origem inválido.';
    end if;
    v_kind := v_origin->>'target_kind';
    if v_kind is null or v_kind not in ('ACCOUNT','CARD') then
      raise exception 'Tipo de recurso inválido.';
    end if;
    if coalesce(v_origin->>'target_id','') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Identificador de recurso inválido.';
    end if;
    v_target := (v_origin->>'target_id')::uuid;
    v_raw_amount := nullif(v_origin->>'allocated_amount','');
    v_amount := null;
    if v_raw_amount is not null then
      if v_raw_amount !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then
        raise exception 'Valor de referência inválido. Use até duas casas decimais.';
      end if;
      v_amount := v_raw_amount::numeric(14,2);
    end if;

    if v_kind='ACCOUNT' then
      perform 1 from public.personal_wallet_accounts a
        where a.id=v_target and a.owner_user_id=v_uid
          and a.archived_at is null and a.capital_source_id is null for share;
      if not found then
        raise exception 'Conta indisponível ou com sincronização de saldos existente.';
      end if;
    else
      perform 1 from public.personal_wallet_cards c
        where c.id=v_target and c.owner_user_id=v_uid and c.status='ACTIVE' for share;
      if not found then raise exception 'Cartão indisponível ou não autorizado.'; end if;
    end if;

    insert into public.capital_source_wallet_references
      (source_id,owner_user_id,target_kind,target_id,allocated_amount)
    values(p_source_id,v_uid,v_kind,v_target,v_amount);
    v_count := v_count+1;
  end loop;
  return true;
exception when unique_violation then
  raise exception 'Origem repetida ou selecionada por outra fonte.';
end $$;

revoke all on function public.capital_source_replace_wallet_origins(uuid,jsonb) from public,anon;
grant execute on function public.capital_source_replace_wallet_origins(uuid,jsonb) to authenticated;

-- Compatibilidade com APKs antigos: o RPC individual permanece válido.
create or replace function public.capital_source_set_wallet_reference(
  p_source_id uuid,p_target_kind text,p_target_id uuid
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p_target_kind is null and p_target_id is null then
    return public.capital_source_replace_wallet_origins(p_source_id,'[]'::jsonb);
  end if;
  if p_target_kind is null or p_target_id is null then
    raise exception 'Selecione uma conta ou cartão válido.';
  end if;
  return public.capital_source_replace_wallet_origins(
    p_source_id,
    jsonb_build_array(jsonb_build_object(
      'target_kind',p_target_kind,'target_id',p_target_id
    ))
  );
end $$;
revoke all on function public.capital_source_set_wallet_reference(uuid,text,uuid) from public,anon;
grant execute on function public.capital_source_set_wallet_reference(uuid,text,uuid) to authenticated;

-- A política de leitura permanece restrita ao titular SUPER_ADMIN; sem GRANT de escrita direta.
