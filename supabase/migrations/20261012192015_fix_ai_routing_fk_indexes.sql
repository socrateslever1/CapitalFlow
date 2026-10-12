create index if not exists n8n_ai_conversation_states_client_fk_idx
  on public.n8n_ai_conversation_states (client_id)
  where client_id is not null;

create index if not exists n8n_ai_intent_events_client_fk_idx
  on public.n8n_ai_intent_events (client_id)
  where client_id is not null;
