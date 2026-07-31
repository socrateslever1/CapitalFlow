alter table public.n8n_collection_policies
  add column if not exists send_hours smallint[] not null default array[9]::smallint[];

update public.n8n_collection_policies
set send_hours = array[send_hour]::smallint[]
where send_hour is not null;

alter table public.n8n_collection_policies
  drop constraint if exists n8n_collection_policies_send_hours_check;

alter table public.n8n_collection_policies
  add constraint n8n_collection_policies_send_hours_check
  check (
    cardinality(send_hours) between 1 and 3
    and send_hours <@ array[8,9,10,11,12,13,14,15,16,17,18]::smallint[]
  );

alter table public.n8n_collection_dispatches
  add column if not exists scheduled_hour smallint;

update public.n8n_collection_dispatches
set scheduled_hour = extract(hour from created_at at time zone 'America/Manaus')::smallint
where scheduled_hour is null;

alter table public.n8n_collection_dispatches
  alter column scheduled_hour set default 9,
  alter column scheduled_hour set not null;

alter table public.n8n_collection_dispatches
  drop constraint if exists n8n_collection_dispatches_scheduled_hour_check;

alter table public.n8n_collection_dispatches
  add constraint n8n_collection_dispatches_scheduled_hour_check
  check (scheduled_hour between 0 and 23);

alter table public.n8n_collection_dispatches
  drop constraint if exists n8n_collection_dispatches_profile_id_installment_id_stage_scheduled_date_key;

drop index if exists public.n8n_collection_dispatches_slot_ux;

create unique index n8n_collection_dispatches_slot_ux
  on public.n8n_collection_dispatches(
    profile_id,
    installment_id,
    stage,
    scheduled_date,
    scheduled_hour
  );
