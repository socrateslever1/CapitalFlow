alter table public.fontes add column if not exists archived_at timestamptz;
alter table public.fontes add column if not exists archived_by uuid;

create or replace function public.delete_or_archive_fonte(p_fonte_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_has_history boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select f.profile_id into v_profile_id
  from public.fontes f
  where f.id = p_fonte_id
  for update;

  if v_profile_id is null then
    raise exception 'Fonte não encontrada';
  end if;

  if not exists (
    select 1 from public.perfis p
    where p.id = v_profile_id and p.user_id = auth.uid()
  ) then
    raise exception 'Sem permissão para alterar esta fonte';
  end if;

  select exists(select 1 from public.transacoes t where t.source_id = p_fonte_id)
      or exists(select 1 from public.contratos c where c.source_id = p_fonte_id)
    into v_has_history;

  if v_has_history then
    update public.fontes
       set archived_at = coalesce(archived_at, now()), archived_by = auth.uid()
     where id = p_fonte_id;
    return jsonb_build_object('action','archived','id',p_fonte_id);
  end if;

  delete from public.fontes where id = p_fonte_id;
  return jsonb_build_object('action','deleted','id',p_fonte_id);
end;
$$;

grant execute on function public.delete_or_archive_fonte(uuid) to authenticated;;
