create or replace function public.sync_mutuo_pre_desembolso_signature_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_type text;
begin
  v_role := upper(coalesce(new.role, new.papel, ''));

  if v_role not in ('DEBTOR', 'DEVEDOR') or coalesce(new.aceitou, true) is not true then
    return new;
  end if;

  select upper(coalesce(tipo_documento, tipo, ''))
    into v_type
  from public.documentos_juridicos
  where id = new.document_id;

  if v_type = 'MUTUO_PRE_DESEMBOLSO' then
    update public.documentos_juridicos
       set status_assinatura = 'ASSINADO',
           status = 'SIGNED_AWAITING_DISBURSEMENT',
           signed_at = coalesce(new.signed_at, now()),
           updated_at = now()
     where id = new.document_id
       and status not in ('ACTIVE', 'CANCELADO', 'CANCELLED');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_mutuo_pre_desembolso_signature_status on public.assinaturas_documento;
create trigger trg_sync_mutuo_pre_desembolso_signature_status
after insert or update of aceitou, role, papel, signed_at
on public.assinaturas_documento
for each row
execute function public.sync_mutuo_pre_desembolso_signature_status();

create or replace function public.confirm_mutuo_pre_desembolso(
  p_document_id uuid,
  p_amount numeric,
  p_disbursed_at timestamptz,
  p_evidence jsonb default '{}'::jsonb
)
returns public.documentos_juridicos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documentos_juridicos;
  v_expected numeric;
begin
  select * into v_doc
  from public.documentos_juridicos
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Documento não encontrado';
  end if;

  if upper(coalesce(v_doc.tipo_documento, v_doc.tipo, '')) <> 'MUTUO_PRE_DESEMBOLSO' then
    raise exception 'Documento não é instrumento de mútuo pré-desembolso';
  end if;

  if upper(coalesce(v_doc.status, '')) <> 'SIGNED_AWAITING_DISBURSEMENT' then
    raise exception 'Documento ainda não está assinado e aguardando desembolso';
  end if;

  v_expected := coalesce(
    nullif(v_doc.snapshot_json->>'principalAmount', '')::numeric,
    nullif(v_doc.snapshot_json->>'amount', '')::numeric,
    0
  );

  if round(coalesce(p_amount, 0), 2) <> round(v_expected, 2) then
    raise exception 'Valor desembolsado diverge do valor assinado';
  end if;

  if p_disbursed_at is null then
    raise exception 'Data do desembolso é obrigatória';
  end if;

  update public.documentos_juridicos
     set status = 'ACTIVE',
         metadata_assinatura = coalesce(metadata_assinatura, '{}'::jsonb) || jsonb_build_object(
           'disbursement', jsonb_build_object(
             'amount', round(p_amount, 2),
             'disbursed_at', p_disbursed_at,
             'evidence', coalesce(p_evidence, '{}'::jsonb),
             'confirmed_at', now()
           )
         ),
         updated_at = now()
   where id = p_document_id
   returning * into v_doc;

  return v_doc;
end;
$$;

revoke all on function public.confirm_mutuo_pre_desembolso(uuid, numeric, timestamptz, jsonb) from public;
grant execute on function public.confirm_mutuo_pre_desembolso(uuid, numeric, timestamptz, jsonb) to authenticated;
