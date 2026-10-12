create table if not exists public.n8n_ai_conversation_states (
  profile_id uuid not null references public.perfis(id) on delete cascade,
  phone_hash text not null,
  conversation_id uuid,
  client_id uuid references public.clientes(id) on delete set null,
  state text not null default 'NEW'
    check (state in (
      'NEW','IDENTIFYING','IDENTIFIED','INTENT_PENDING','RESOLVING_READ',
      'AWAITING_CONFIRMATION','EXECUTING','COMPLETED','HUMAN_HANDOFF'
    )),
  last_intent text,
  last_route text not null default 'UNKNOWN'
    check (last_route in (
      'READ_ONLY_SKILL','FINANCIAL_BLOCKED','HUMAN_HANDOFF','LOAN_INTEREST','UNKNOWN'
    )),
  last_message_id text,
  context jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, phone_hash)
);

alter table public.n8n_ai_conversation_states enable row level security;
revoke all on table public.n8n_ai_conversation_states from anon, authenticated;
grant select, insert, update, delete on table public.n8n_ai_conversation_states to service_role;

create index if not exists n8n_ai_conversation_states_conversation_idx
  on public.n8n_ai_conversation_states (conversation_id)
  where conversation_id is not null;

create index if not exists n8n_ai_conversation_states_client_idx
  on public.n8n_ai_conversation_states (profile_id, client_id)
  where client_id is not null;

create table if not exists public.n8n_ai_intent_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  conversation_id uuid,
  client_id uuid references public.clientes(id) on delete set null,
  message_id text not null,
  source text not null default 'WHATSAPP',
  intent text not null,
  route text not null
    check (route in (
      'READ_ONLY_SKILL','FINANCIAL_BLOCKED','HUMAN_HANDOFF','LOAN_INTEREST','UNKNOWN'
    )),
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  state text not null
    check (state in (
      'NEW','IDENTIFYING','IDENTIFIED','INTENT_PENDING','RESOLVING_READ',
      'AWAITING_CONFIRMATION','EXECUTING','COMPLETED','HUMAN_HANDOFF'
    )),
  created_at timestamptz not null default now(),
  unique (profile_id, message_id)
);

alter table public.n8n_ai_intent_events enable row level security;
revoke all on table public.n8n_ai_intent_events from anon, authenticated;
grant select, insert on table public.n8n_ai_intent_events to service_role;

create index if not exists n8n_ai_intent_events_profile_created_idx
  on public.n8n_ai_intent_events (profile_id, created_at desc);

create index if not exists n8n_ai_intent_events_conversation_idx
  on public.n8n_ai_intent_events (conversation_id, created_at desc)
  where conversation_id is not null;

comment on table public.n8n_ai_conversation_states is
  'Estado interno e mínimo da conversa para roteamento seguro do WhatsApp/n8n. Sem texto bruto ou segredos.';

comment on table public.n8n_ai_intent_events is
  'Eventos de roteamento de intenção sem conteúdo bruto da mensagem. Observabilidade interna.';
