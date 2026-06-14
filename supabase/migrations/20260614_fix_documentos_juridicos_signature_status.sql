-- Alinha a tabela de documentos ao fluxo atual de assinatura publica.
-- A RPC usa EM_ASSINATURA quando ha assinatura parcial, mas as constraints
-- antigas permitiam apenas PENDENTE/ASSINADO/CANCELADO.

alter table public.documentos_juridicos
  drop constraint if exists documentos_juridicos_signed_at_check;

alter table public.documentos_juridicos
  drop constraint if exists documentos_status_check;

alter table public.documentos_juridicos
  add constraint documentos_status_check
  check (status_assinatura in ('PENDENTE', 'EM_ASSINATURA', 'ASSINADO', 'CANCELADO'));

alter table public.documentos_juridicos
  add constraint documentos_juridicos_signed_at_check
  check (
    (status_assinatura = 'ASSINADO' and signed_at is not null)
    or (status_assinatura in ('PENDENTE', 'EM_ASSINATURA', 'CANCELADO') and signed_at is null)
  );

update public.documentos_juridicos d
set status_assinatura = 'EM_ASSINATURA',
    updated_at = now()
where d.status_assinatura = 'PENDENTE'
  and exists (
    select 1
    from public.assinaturas_documento s
    where s.document_id = d.id
  );

create or replace function public.sign_documento_juridico_by_view_token(
  p_view_token text,
  p_papel text,
  p_nome text,
  p_cpf text,
  p_ip text default null,
  p_user_agent text default null,
  p_hash_assinado text default null,
  p_assinatura_imagem text default null,
  p_dispositivo_info jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documentos_juridicos%rowtype;
  v_role text;
  v_signed_roles text[];
  v_required_roles text[] := array[]::text[];
  v_witness_count integer := 0;
  v_next_status text := 'EM_ASSINATURA';
  i integer;
begin
  select *
    into v_doc
  from public.documentos_juridicos
  where view_token = p_view_token
  limit 1;

  if v_doc.id is null then
    return jsonb_build_object('success', false, 'message', 'Documento invalido ou link expirado.');
  end if;

  v_role := upper(trim(coalesce(p_papel, '')));

  if v_role in ('DEVEDOR', 'DEBTOR') then
    v_role := 'DEBTOR';
  elsif v_role in ('CREDOR', 'CREDITOR') then
    v_role := 'CREDITOR';
  elsif v_role in ('AVALISTA', 'GUARANTOR') then
    v_role := 'AVALISTA';
  elsif v_role like 'TESTEMUNHA_%' then
    v_role := replace(v_role, 'TESTEMUNHA_', 'WITNESS_');
  elsif v_role = 'TESTEMUNHA' then
    v_role := 'WITNESS_1';
  elsif v_role = 'WITNESS' then
    v_role := 'WITNESS_1';
  end if;

  if v_role = '' then
    return jsonb_build_object('success', false, 'message', 'Papel da assinatura nao informado.');
  end if;

  if exists (
    select 1
    from public.assinaturas_documento s
    where s.document_id = v_doc.id
      and upper(coalesce(s.papel, s.role, '')) = v_role
  ) then
    return jsonb_build_object('success', false, 'message', 'Este papel ja assinou o documento.');
  end if;

  insert into public.assinaturas_documento (
    document_id,
    profile_id,
    nome,
    cpf,
    aceitou,
    ip,
    signer_name,
    signer_document,
    role,
    papel,
    assinatura_hash,
    hash_assinado,
    hash_assinatura,
    ip_origem,
    user_agent,
    signed_at,
    assinatura_imagem,
    dispositivo_info
  ) values (
    v_doc.id,
    v_doc.profile_id,
    upper(coalesce(p_nome, '')),
    regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'),
    true,
    coalesce(p_ip, '0.0.0.0'),
    upper(coalesce(p_nome, '')),
    regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'),
    v_role,
    v_role,
    p_hash_assinado,
    p_hash_assinado,
    p_hash_assinado,
    coalesce(p_ip, '0.0.0.0'),
    coalesce(p_user_agent, ''),
    now(),
    p_assinatura_imagem,
    coalesce(p_dispositivo_info, '{}'::jsonb)
  );

  select coalesce(array_agg(distinct upper(coalesce(s.papel, s.role, ''))), array[]::text[])
    into v_signed_roles
  from public.assinaturas_documento s
  where s.document_id = v_doc.id;

  if v_doc.snapshot ? 'debtorName' then
    v_required_roles := v_required_roles || 'DEBTOR';
  end if;

  if v_doc.snapshot ? 'creditorName' then
    v_required_roles := v_required_roles || 'CREDITOR';
  end if;

  select count(*)
    into v_witness_count
  from jsonb_array_elements(coalesce(v_doc.snapshot -> 'witnesses', '[]'::jsonb)) w
  where w is not null;

  for i in 1..v_witness_count loop
    v_required_roles := v_required_roles || ('WITNESS_' || i);
  end loop;

  if coalesce((v_doc.snapshot ->> 'incluirAvalista')::boolean, false)
     and coalesce(v_doc.snapshot ->> 'avalistaNome', '') <> '' then
    v_required_roles := v_required_roles || 'AVALISTA';
  end if;

  if cardinality(v_required_roles) > 0
     and not exists (
       select 1
       from unnest(v_required_roles) required(role_name)
       where not (required.role_name = any(v_signed_roles))
     ) then
    v_next_status := 'ASSINADO';
  end if;

  update public.documentos_juridicos
  set status_assinatura = v_next_status,
      signed_at = case when v_next_status = 'ASSINADO' then now() else signed_at end,
      updated_at = now()
  where id = v_doc.id;

  return jsonb_build_object('success', true, 'status', v_next_status);
end;
$$;

grant execute on function public.sign_documento_juridico_by_view_token(text, text, text, text, text, text, text, text, jsonb)
  to anon, authenticated, service_role;
