drop index if exists public.whatsapp_queue_dedupe_key_uidx;

create unique index whatsapp_queue_dedupe_key_uidx
  on public.whatsapp_queue(dedupe_key);
