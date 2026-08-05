alter table public.whatsapp_queue
  add column if not exists dedupe_key text;

create unique index if not exists whatsapp_queue_dedupe_key_uidx
  on public.whatsapp_queue(dedupe_key);

comment on column public.whatsapp_queue.dedupe_key is
  'Idempotency key for external events that must produce at most one WhatsApp delivery.';
