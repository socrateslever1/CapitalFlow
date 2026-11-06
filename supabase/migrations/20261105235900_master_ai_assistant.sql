create table if not exists public.ai_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  conversation_id uuid not null,
  request_id uuid not null,
  request_text text not null check (char_length(trim(request_text)) between 1 and 12000),
  response_text text,
  intent text not null default 'UNKNOWN' check (intent in ('READ', 'DRAFT', 'CONFIRM', 'FORBIDDEN', 'UNKNOWN')),
  permission_mode text not null default 'READ' check (permission_mode in ('READ', 'DRAFT', 'CONFIRM', 'FORBIDDEN')),
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'RESPONDED', 'FAILED', 'CONFIRMATION_REQUIRED')),
  provider text,
  model text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, request_id)
);

create index if not exists ai_assistant_requests_profile_created_idx
  on public.ai_assistant_requests(profile_id, created_at desc);

alter table public.ai_assistant_requests enable row level security;
revoke all on public.ai_assistant_requests from public, anon;
grant select on public.ai_assistant_requests to authenticated;

drop policy if exists ai_assistant_requests_master_read on public.ai_assistant_requests;
create policy ai_assistant_requests_master_read on public.ai_assistant_requests
  for select to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_platform_super_admin()));

comment on table public.ai_assistant_requests is
  'Solicitacoes do mascote interno; somente o perfil master pode consultar. A IA nao grava ledger por esta tabela.';
