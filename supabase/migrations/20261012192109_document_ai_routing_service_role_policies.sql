drop policy if exists n8n_ai_conversation_states_service_role on public.n8n_ai_conversation_states;
create policy n8n_ai_conversation_states_service_role
  on public.n8n_ai_conversation_states
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists n8n_ai_intent_events_service_role_select on public.n8n_ai_intent_events;
create policy n8n_ai_intent_events_service_role_select
  on public.n8n_ai_intent_events
  for select
  to service_role
  using (true);

drop policy if exists n8n_ai_intent_events_service_role_insert on public.n8n_ai_intent_events;
create policy n8n_ai_intent_events_service_role_insert
  on public.n8n_ai_intent_events
  for insert
  to service_role
  with check (true);
