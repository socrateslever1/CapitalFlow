set search_path = public;

alter table public.whatsapp_queue
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists lock_token uuid,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists max_attempts smallint not null default 5;

alter table public.whatsapp_queue
  alter column attempts set default 0;

update public.whatsapp_queue
set attempts = coalesce(attempts, 0),
    available_at = coalesce(available_at, created_at, now());

create index if not exists whatsapp_queue_claim_idx
  on public.whatsapp_queue(profile_id, available_at, created_at)
  where status = 'PENDING';

create index if not exists whatsapp_queue_stale_lock_idx
  on public.whatsapp_queue(locked_at)
  where status = 'PROCESSING';

create or replace function public.claim_whatsapp_queue(
  p_profile_id uuid,
  p_limit integer default 10,
  p_lock_timeout interval default interval '5 minutes'
)
returns table (
  id uuid,
  profile_id uuid,
  phone text,
  message text,
  loan_id uuid,
  parcela_id uuid,
  attempts integer,
  lock_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.whatsapp_queue q
  set status = case when coalesce(q.attempts, 0) >= q.max_attempts then 'ERROR' else 'PENDING' end,
      available_at = case when coalesce(q.attempts, 0) >= q.max_attempts then q.available_at else now() end,
      error_message = case
        when coalesce(q.attempts, 0) >= q.max_attempts then coalesce(q.error_message, 'Tempo limite de processamento excedido.')
        else q.error_message
      end,
      locked_at = null,
      lock_token = null
  where q.profile_id = p_profile_id
    and q.status = 'PROCESSING'
    and (q.locked_at is null or q.locked_at < now() - p_lock_timeout);

  return query
  with candidates as (
    select q.id
    from public.whatsapp_queue q
    where q.profile_id = p_profile_id
      and q.status = 'PENDING'
      and q.available_at <= now()
      and coalesce(q.attempts, 0) < q.max_attempts
    order by q.available_at, q.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  )
  update public.whatsapp_queue q
  set status = 'PROCESSING',
      attempts = coalesce(q.attempts, 0) + 1,
      last_attempt_at = now(),
      locked_at = now(),
      lock_token = gen_random_uuid(),
      error_message = null
  from candidates c
  where q.id = c.id
  returning q.id, q.profile_id, q.phone, q.message, q.loan_id, q.parcela_id,
            q.attempts, q.lock_token;
end;
$$;

create or replace function public.ack_whatsapp_queue(
  p_profile_id uuid,
  p_queue_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.whatsapp_queue%rowtype;
  v_terminal boolean;
  v_delay_seconds integer;
begin
  select *
  into v_item
  from public.whatsapp_queue
  where id = p_queue_id
    and profile_id = p_profile_id
    and status = 'PROCESSING'
    and lock_token = p_lock_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'stale_or_unknown_lock');
  end if;

  if p_success then
    update public.whatsapp_queue
    set status = 'SENT',
        sent_at = now(),
        error_message = null,
        locked_at = null,
        lock_token = null
    where id = p_queue_id;
    return jsonb_build_object('ok', true, 'status', 'SENT', 'attempts', v_item.attempts);
  end if;

  v_terminal := coalesce(v_item.attempts, 0) >= v_item.max_attempts;
  v_delay_seconds := least(900, 30 * (2 ^ greatest(coalesce(v_item.attempts, 1) - 1, 0))::integer);

  update public.whatsapp_queue
  set status = case when v_terminal then 'ERROR' else 'PENDING' end,
      available_at = case when v_terminal then available_at else now() + make_interval(secs => v_delay_seconds) end,
      error_message = left(coalesce(nullif(p_error, ''), 'Falha no envio pelo WhatsApp.'), 500),
      locked_at = null,
      lock_token = null
  where id = p_queue_id;

  return jsonb_build_object(
    'ok', true,
    'status', case when v_terminal then 'ERROR' else 'PENDING' end,
    'attempts', v_item.attempts,
    'retry_in_seconds', case when v_terminal then null else v_delay_seconds end
  );
end;
$$;

create or replace function public.claim_whatsapp_queue_item(
  p_queue_id uuid,
  p_lock_timeout interval default interval '5 minutes'
)
returns table (
  id uuid,
  profile_id uuid,
  phone text,
  message text,
  loan_id uuid,
  parcela_id uuid,
  attempts integer,
  lock_token uuid
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidate as (
    select q.id
    from public.whatsapp_queue q
    where q.id = p_queue_id
      and (
        (q.status = 'PENDING' and q.available_at <= now())
        or (q.status = 'PROCESSING' and (q.locked_at is null or q.locked_at < now() - p_lock_timeout))
      )
      and coalesce(q.attempts, 0) < q.max_attempts
    for update skip locked
  )
  update public.whatsapp_queue q
  set status = 'PROCESSING',
      attempts = coalesce(q.attempts, 0) + 1,
      last_attempt_at = now(),
      locked_at = now(),
      lock_token = gen_random_uuid(),
      error_message = null
  from candidate c
  where q.id = c.id
  returning q.id, q.profile_id, q.phone, q.message, q.loan_id, q.parcela_id,
            q.attempts, q.lock_token;
$$;

revoke all on function public.claim_whatsapp_queue(uuid, integer, interval) from public, anon, authenticated;
revoke all on function public.ack_whatsapp_queue(uuid, uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_queue_item(uuid, interval) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_queue(uuid, integer, interval) to service_role;
grant execute on function public.ack_whatsapp_queue(uuid, uuid, uuid, boolean, text) to service_role;
grant execute on function public.claim_whatsapp_queue_item(uuid, interval) to service_role;

notify pgrst, 'reload schema';
