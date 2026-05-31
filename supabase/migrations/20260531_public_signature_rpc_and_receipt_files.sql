alter table public.assinaturas_documento
  add column if not exists profile_id uuid,
  add column if not exists nome text,
  add column if not exists cpf text,
  add column if not exists aceitou boolean default true,
  add column if not exists ip text,
  add column if not exists role text,
  add column if not exists papel text,
  add column if not exists assinatura_hash text,
  add column if not exists hash_assinado text,
  add column if not exists hash_assinatura text,
  add column if not exists assinatura_imagem text,
  add column if not exists dispositivo_info jsonb;

create index if not exists idx_assinaturas_documento_document_role
on public.assinaturas_documento(document_id, papel, role);

create or replace function public.get_documento_assinaturas_by_view_token(p_view_token text)
returns setof public.assinaturas_documento
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
begin
  select id
    into v_document_id
  from public.documentos_juridicos
  where view_token = p_view_token
  limit 1;

  if v_document_id is null then
    return;
  end if;

  return query
  select s.*
  from public.assinaturas_documento s
  where s.document_id = v_document_id
  order by s.signed_at asc nulls last;
end;
$$;

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
      updated_at = now()
  where id = v_doc.id;

  return jsonb_build_object('success', true, 'status', v_next_status);
end;
$$;

grant execute on function public.get_documento_assinaturas_by_view_token(text) to anon, authenticated, service_role;
grant execute on function public.sign_documento_juridico_by_view_token(text, text, text, text, text, text, text, text, jsonb) to anon, authenticated, service_role;
