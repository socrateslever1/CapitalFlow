alter table public.n8n_ai_intent_events
  add column if not exists state_before text,
  add column if not exists state_after text,
  add column if not exists skill text,
  add column if not exists tool text,
  add column if not exists duration_ms integer,
  add column if not exists result text,
  add column if not exists error_code text,
  add column if not exists handoff boolean not null default false;

comment on column public.n8n_ai_intent_events.state_before is 'Estado anterior, sem conteúdo da mensagem.';
comment on column public.n8n_ai_intent_events.state_after is 'Estado posterior, sem conteúdo da mensagem.';
comment on column public.n8n_ai_intent_events.skill is 'Skill selecionada, quando aplicável.';
comment on column public.n8n_ai_intent_events.tool is 'Tool autorizada utilizada, quando aplicável.';
comment on column public.n8n_ai_intent_events.duration_ms is 'Duração total observada em milissegundos.';
comment on column public.n8n_ai_intent_events.result is 'Resultado técnico resumido e não sensível.';
comment on column public.n8n_ai_intent_events.error_code is 'Código de erro sanitizado; nunca mensagem bruta.';
comment on column public.n8n_ai_intent_events.handoff is 'Indica encaminhamento para atendimento humano.';
