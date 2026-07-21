insert into public.n8n_collection_policies (
  profile_id,
  loan_id,
  enabled,
  overdue_cadence,
  tone,
  remind_two_days_before,
  remind_due_today,
  remind_first_overdue_day,
  send_hour,
  max_consecutive_messages,
  paused,
  pause_reason
)
values (
  '62dcbb45-f02c-42ba-84a4-916af9854dea',
  null,
  true,
  'DAILY',
  'MEDIATOR',
  true,
  true,
  true,
  9,
  10,
  false,
  null
)
on conflict (profile_id) where loan_id is null do update
set
  enabled = excluded.enabled,
  overdue_cadence = excluded.overdue_cadence,
  tone = excluded.tone,
  remind_two_days_before = excluded.remind_two_days_before,
  remind_due_today = excluded.remind_due_today,
  remind_first_overdue_day = excluded.remind_first_overdue_day,
  send_hour = excluded.send_hour,
  max_consecutive_messages = excluded.max_consecutive_messages,
  paused = excluded.paused,
  pause_reason = excluded.pause_reason,
  updated_at = now();
