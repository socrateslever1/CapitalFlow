revoke all on public.ai_assistant_requests from authenticated;
grant select, insert, update on public.ai_assistant_requests to authenticated;

drop policy if exists ai_assistant_requests_master_insert on public.ai_assistant_requests;
create policy ai_assistant_requests_master_insert on public.ai_assistant_requests
  for insert to authenticated
  with check ((select auth.uid()) = profile_id and (select public.is_platform_super_admin()));

drop policy if exists ai_assistant_requests_master_update on public.ai_assistant_requests;
create policy ai_assistant_requests_master_update on public.ai_assistant_requests
  for update to authenticated
  using ((select auth.uid()) = profile_id and (select public.is_platform_super_admin()))
  with check ((select auth.uid()) = profile_id and (select public.is_platform_super_admin()));
