-- Arquivamento auditável e avaliação restrita à carteira do operador autenticado.
-- Nenhum dado de outra carteira é consultado ou divulgado.
alter table public.contratos
  add column if not exists archive_reason text,
  add column if not exists archive_note text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='contratos_archive_reason_valid') then
    alter table public.contratos add constraint contratos_archive_reason_valid
      check(archive_reason is null or archive_reason in (
        'NON_PAYMENT','BAD_DEBT','VOLUNTARY_WAIVER','BILATERAL_OFFSET',
        'ADMINISTRATIVE','DISPUTED','OTHER'));
  end if;
  if not exists(select 1 from pg_constraint where conname='contratos_archive_note_size') then
    alter table public.contratos add constraint contratos_archive_note_size
      check(archive_note is null or char_length(archive_note) <= 500);
  end if;
end $$;

create index if not exists idx_contratos_credit_owner_client
  on public.contratos (owner_id, client_id);
create index if not exists idx_contratos_credit_archive
  on public.contratos (owner_id, is_archived, archive_reason);

create table if not exists public.contract_archive_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contratos(id) on delete cascade,
  owner_id uuid not null references public.perfis(id),
  actor_profile_id uuid,
  previous_reason text,
  new_reason text,
  previously_archived boolean not null,
  currently_archived boolean not null,
  changed_at timestamptz not null default now()
);
create index if not exists idx_contract_archive_events_owner
  on public.contract_archive_events(owner_id,contract_id,changed_at desc);
alter table public.contract_archive_events enable row level security;
revoke all on public.contract_archive_events from public, anon, authenticated;
grant select on public.contract_archive_events to authenticated;
drop policy if exists contract_archive_events_tenant_read on public.contract_archive_events;
create policy contract_archive_events_tenant_read on public.contract_archive_events
  for select to authenticated using (
    owner_id = (
      select coalesce(p.supervisor_id,p.id)
      from public.perfis p where p.id=public.current_profile_id()
    )
  );

create or replace function public.audit_contract_archive_reason()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if old.is_archived is distinct from new.is_archived
     or old.archive_reason is distinct from new.archive_reason
     or old.archive_note is distinct from new.archive_note then
    insert into public.contract_archive_events(
      contract_id,owner_id,actor_profile_id,previous_reason,new_reason,
      previously_archived,currently_archived
    ) values (
      new.id,new.owner_id,public.current_profile_id(),old.archive_reason,new.archive_reason,
      coalesce(old.is_archived,false),coalesce(new.is_archived,false)
    );
  end if;
  return new;
end $$;
revoke all on function public.audit_contract_archive_reason() from public,anon,authenticated;
drop trigger if exists trg_audit_contract_archive_reason on public.contratos;
create trigger trg_audit_contract_archive_reason
  after update of is_archived,archive_reason,archive_note on public.contratos
  for each row execute function public.audit_contract_archive_reason();

create or replace function public.classify_contract_archive_v1(
  p_loan_id uuid, p_reason text, p_note text default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_actor uuid;
  v_owner uuid;
  v_record record;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  v_actor := public.current_profile_id();
  select coalesce(p.supervisor_id,p.id) into v_owner
    from public.perfis p where p.id=v_actor;
  if v_actor is null or v_owner is null then raise exception 'Perfil inválido' using errcode='42501'; end if;
  if p_reason is null or p_reason not in (
    'NON_PAYMENT','BAD_DEBT','VOLUNTARY_WAIVER','BILATERAL_OFFSET',
    'ADMINISTRATIVE','DISPUTED','OTHER'
  ) then raise exception 'Motivo inválido' using errcode='22023'; end if;
  if char_length(coalesce(v_note,''))>500
    or (p_reason<>'ADMINISTRATIVE' and char_length(coalesce(v_note,''))<10) then
    raise exception 'Justificativa inválida' using errcode='22023';
  end if;

  update public.contratos
    set is_archived=true,archive_reason=p_reason,archive_note=v_note,
        archived_at=coalesce(archived_at,now()),archived_by=v_actor
    where id=p_loan_id and owner_id=v_owner
    returning id,archive_reason into v_record;
  if not found then raise exception 'Contrato indisponível' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'loan_id',v_record.id,'reason',v_record.archive_reason);
end $$;
revoke all on function public.classify_contract_archive_v1(uuid,text,text) from public,anon;
grant execute on function public.classify_contract_archive_v1(uuid,text,text) to authenticated;

create or replace function public.assess_client_credit_v1(
  p_client_id uuid default null, p_document text default null
) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp
as $$
declare
  v_actor uuid;
  v_owner uuid;
  v_doc text := regexp_replace(coalesce(p_document,''),'[^0-9]','','g');
begin
  if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  v_actor := public.current_profile_id();
  select coalesce(p.supervisor_id,p.id) into v_owner from public.perfis p where p.id=v_actor;
  if v_owner is null then raise exception 'Perfil inválido' using errcode='42501'; end if;
  if char_length(v_doc) not in (11,14) or v_doc ~ '^0+$' then v_doc:=''; end if;
  if p_client_id is not null and not exists (
    select 1 from public.clientes cl where cl.id=p_client_id and cl.owner_id=v_owner
  ) then raise exception 'Cliente não pertence à carteira' using errcode='42501'; end if;
  if p_client_id is null and v_doc='' then
    return jsonb_build_object('status','REVIEW','reason','IDENTITY_UNVERIFIED');
  end if;

  -- A associação usa somente vínculo de cadastro ou documento completo, jamais nomes.
  if exists(
    select 1 from public.contratos c where c.owner_id=v_owner
      and ((p_client_id is not null and c.client_id=p_client_id)
        or (v_doc<>'' and regexp_replace(coalesce(c.debtor_document,''),'[^0-9]','','g')=v_doc))
      and c.is_archived is true and c.archive_reason in ('NON_PAYMENT','BAD_DEBT')
  ) then return jsonb_build_object('status','BLOCK','reason','ARCHIVED_DEFAULT'); end if;

  if exists(
    select 1 from public.contratos c
      join public.parcelas i on i.loan_id=c.id
    where c.owner_id=v_owner
      and ((p_client_id is not null and c.client_id=p_client_id)
        or (v_doc<>'' and regexp_replace(coalesce(c.debtor_document,''),'[^0-9]','','g')=v_doc))
      and coalesce(c.is_archived,false)=false
      and upper(coalesce(c.status,'')) not in ('PAID','PAGO','QUITADO','CANCELADO','CANCELED')
      and upper(coalesce(i.status,'')) not in ('PAID','PAGO','QUITADO','CANCELADO','CANCELED','RENEGOCIADO')
      and coalesce(i.due_date,i.data_vencimento) < (now() at time zone 'America/Manaus')::date
      and greatest(
        coalesce(i.principal_remaining,0)+coalesce(i.interest_remaining,0)+coalesce(i.late_fee_accrued,0),
        coalesce(i.amount,i.valor_parcela,0)-coalesce(i.paid_total,0)
      )>0.005
  ) then return jsonb_build_object('status','BLOCK','reason','OVERDUE_PAYMENT'); end if;

  if exists(
    select 1 from public.contratos c
      join public.acordos_inadimplencia a on a.loan_id=c.id and a.profile_id=v_owner
      join public.acordo_parcelas ap on ap.acordo_id=a.id and ap.profile_id=v_owner
    where c.owner_id=v_owner
      and ((p_client_id is not null and c.client_id=p_client_id)
        or (v_doc<>'' and regexp_replace(coalesce(c.debtor_document,''),'[^0-9]','','g')=v_doc))
      and coalesce(c.is_archived,false)=false
      and upper(coalesce(a.status,'')) in ('ACTIVE','ATIVO','EM_ACORDO')
      and upper(coalesce(ap.status,'')) not in ('PAID','PAGO','QUITADO','CANCELADO','CANCELED','RENEGOCIADO')
      and coalesce(ap.due_date,ap.data_vencimento) < (now() at time zone 'America/Manaus')::date
      and coalesce(ap.amount,ap.valor,0)-coalesce(ap.paid_amount,ap.valor_pago,0)>0.005
  ) then return jsonb_build_object('status','BLOCK','reason','OVERDUE_AGREEMENT'); end if;

  if exists(
    select 1 from public.contratos c where c.owner_id=v_owner
      and ((p_client_id is not null and c.client_id=p_client_id)
        or (v_doc<>'' and regexp_replace(coalesce(c.debtor_document,''),'[^0-9]','','g')=v_doc))
      and coalesce(c.is_archived,false)=true
      and (c.archive_reason is null or c.archive_reason in ('DISPUTED','OTHER'))
  ) then return jsonb_build_object('status','REVIEW','reason','ARCHIVE_NEEDS_CLASSIFICATION'); end if;
  return jsonb_build_object('status','ALLOW','reason','NO_RESTRICTIONS');
end $$;
revoke all on function public.assess_client_credit_v1(uuid,text) from public,anon;
grant execute on function public.assess_client_credit_v1(uuid,text) to authenticated;
