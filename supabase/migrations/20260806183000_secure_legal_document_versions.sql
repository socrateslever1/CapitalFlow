alter table public.documentos_juridicos_versoes enable row level security;

revoke all on table public.documentos_juridicos_versoes from anon, authenticated;
revoke all on function public.create_documento_juridico_versionado(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) from public, anon;
grant execute on function public.create_documento_juridico_versionado(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) to authenticated;

create or replace function public.create_documento_juridico_versionado(
  p_base_document_id uuid,
  p_client_id uuid,
  p_loan_id uuid,
  p_tipo text,
  p_snapshot jsonb,
  p_rendered_html text,
  p_profile_id uuid,
  p_registration_link_id uuid default null
)
returns table(id uuid, view_token text, root_document_id uuid, document_version integer, content_hash text, status_assinatura text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_base public.documentos_juridicos%rowtype;
  v_id uuid := gen_random_uuid();
  v_root uuid;
  v_version integer := 1;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_hash text;
  v_signature_count integer := 0;
  v_target_profile uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão autenticada obrigatória.';
  end if;

  if coalesce(trim(p_rendered_html), '') = '' then
    raise exception 'O conteúdo jurídico não pode estar vazio.';
  end if;

  select coalesce(
    (select c.owner_id from public.clientes c where c.id = p_client_id),
    (select coalesce(ct.owner_id, ct.profile_id) from public.contratos ct where ct.id = p_loan_id),
    p_profile_id
  ) into v_target_profile;

  if v_target_profile is null or not exists (
    select 1
      from public.perfis requester
      join public.perfis target on target.id = v_target_profile
     where requester.user_id = auth.uid()
       and (
         requester.id = target.id
         or coalesce(requester.owner_profile_id, requester.supervisor_id, requester.id)
            = coalesce(target.owner_profile_id, target.supervisor_id, target.id)
       )
  ) then
    raise exception 'Acesso negado ao cliente ou contrato informado.';
  end if;

  if p_profile_id is not null and not exists (
    select 1
      from public.perfis requester
      join public.perfis informed on informed.id = p_profile_id
     where requester.user_id = auth.uid()
       and (
         requester.id = informed.id
         or coalesce(requester.owner_profile_id, requester.supervisor_id, requester.id)
            = coalesce(informed.owner_profile_id, informed.supervisor_id, informed.id)
       )
  ) then
    raise exception 'Perfil jurídico não pertence à equipe autenticada.';
  end if;

  if p_base_document_id is not null then
    select * into v_base
      from public.documentos_juridicos d
     where d.id = p_base_document_id
     for update;

    if v_base.id is null then
      raise exception 'Documento-base não encontrado.';
    end if;

    if not exists (
      select 1
        from public.perfis requester
        join public.perfis target on target.id = coalesce(v_base.dono_id, v_base.profile_id, v_target_profile)
       where requester.user_id = auth.uid()
         and (
           requester.id = target.id
           or coalesce(requester.owner_profile_id, requester.supervisor_id, requester.id)
              = coalesce(target.owner_profile_id, target.supervisor_id, target.id)
         )
    ) then
      raise exception 'Documento-base não pertence à equipe autenticada.';
    end if;

    select count(*) into v_signature_count
      from public.assinaturas_documento a
     where a.document_id = v_base.id;

    if v_signature_count > 0 or upper(coalesce(v_base.status_assinatura,'')) in ('ASSINADO','SIGNED') then
      raise exception 'Documento assinado não pode ser editado. Gere um novo instrumento independente.';
    end if;

    v_root := coalesce(v_base.root_document_id, v_base.id);
    select coalesce(max(d.document_version),0) + 1
      into v_version
      from public.documentos_juridicos d
     where coalesce(d.root_document_id,d.id) = v_root;
  else
    v_root := v_id;
  end if;

  v_hash := encode(digest(p_rendered_html,'sha256'),'hex');

  insert into public.documentos_juridicos(
    id, root_document_id, supersedes_document_id, document_version,
    client_id, loan_id, profile_id, dono_id, registration_link_id,
    tipo, tipo_documento, snapshot, snapshot_json, snapshot_rendered_html,
    hash_sha256, content_hash, view_token, status_assinatura, status,
    created_at, updated_at
  ) values (
    v_id, v_root, p_base_document_id, v_version,
    p_client_id, p_loan_id, p_profile_id, v_target_profile, p_registration_link_id,
    coalesce(nullif(p_tipo,''),'CONFISSAO'), coalesce(nullif(p_tipo,''),'CONFISSAO'),
    coalesce(p_snapshot,'{}'::jsonb), coalesce(p_snapshot,'{}'::jsonb), p_rendered_html,
    v_hash, v_hash, v_token, 'PENDENTE', 'PENDENTE', now(), now()
  );

  if v_base.id is not null then
    insert into public.documentos_juridicos_versoes(
      documento_id, root_document_id, versao, snapshot, snapshot_rendered_html,
      content_hash, status_assinatura, created_by
    ) values (
      v_base.id, v_root, coalesce(v_base.document_version,1), v_base.snapshot,
      v_base.snapshot_rendered_html, coalesce(v_base.content_hash,v_base.hash_sha256),
      v_base.status_assinatura, p_profile_id
    ) on conflict (root_document_id,versao) do nothing;

    update public.documentos_juridicos d
       set status_assinatura='SUPERSEDED', status='SUPERSEDED', updated_at=now()
     where d.id=v_base.id;
  end if;

  return query
  select d.id,d.view_token,d.root_document_id,d.document_version,d.content_hash,d.status_assinatura
    from public.documentos_juridicos d
   where d.id=v_id;
end;
$$;

revoke all on function public.create_documento_juridico_versionado(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) from public, anon;
grant execute on function public.create_documento_juridico_versionado(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) to authenticated;
