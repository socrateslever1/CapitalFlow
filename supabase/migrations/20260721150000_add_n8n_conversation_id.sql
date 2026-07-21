alter table public.n8n_client_sessions
  add column if not exists conversation_id uuid not null default gen_random_uuid();

comment on column public.n8n_client_sessions.conversation_id is
  'Identificador rotativo usado para isolar a memoria de cada conversa no atendimento automatizado.';
