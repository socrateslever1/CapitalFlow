alter table public.ai_assistant_requests
  drop constraint if exists ai_assistant_requests_profile_id_fkey;

alter table public.ai_assistant_requests
  add constraint ai_assistant_requests_profile_id_fkey
  foreign key (profile_id) references auth.users(id) on delete cascade;
