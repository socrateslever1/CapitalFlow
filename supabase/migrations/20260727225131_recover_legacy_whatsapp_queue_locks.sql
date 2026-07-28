set search_path = public;

update public.whatsapp_queue
set status = case when coalesce(attempts, 0) >= max_attempts then 'ERROR' else 'PENDING' end,
    available_at = now(),
    locked_at = null,
    lock_token = null,
    error_message = case
      when coalesce(attempts, 0) >= max_attempts then coalesce(error_message, 'Tempo limite de processamento excedido.')
      else error_message
    end
where status = 'PROCESSING'
  and (locked_at is null or locked_at < now() - interval '5 minutes');

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
revoke all on function public.claim_whatsapp_queue_item(uuid, interval) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_queue(uuid, integer, interval) to service_role;
grant execute on function public.claim_whatsapp_queue_item(uuid, interval) to service_role;

notify pgrst, 'reload schema';
