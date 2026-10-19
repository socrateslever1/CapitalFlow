alter table public.n8n_ai_conversation_states
  drop constraint if exists n8n_ai_conversation_states_last_route_check;

alter table public.n8n_ai_conversation_states
  add constraint n8n_ai_conversation_states_last_route_check
  check (
    last_route in (
      'READ_ONLY_SKILL',
      'FINANCIAL_BLOCKED',
      'HUMAN_HANDOFF',
      'LOAN_INTEREST',
      'CONVERSATION',
      'UNKNOWN'
    )
  );

alter table public.n8n_ai_intent_events
  drop constraint if exists n8n_ai_intent_events_route_check;

alter table public.n8n_ai_intent_events
  add constraint n8n_ai_intent_events_route_check
  check (
    route in (
      'READ_ONLY_SKILL',
      'FINANCIAL_BLOCKED',
      'HUMAN_HANDOFF',
      'LOAN_INTEREST',
      'CONVERSATION',
      'UNKNOWN'
    )
  );
