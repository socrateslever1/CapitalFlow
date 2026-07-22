alter table public.n8n_collection_policies
  add column if not exists client_id uuid references public.clientes(id) on delete cascade;

alter table public.n8n_collection_policies
  drop constraint if exists n8n_collection_policies_single_scope_ck;

alter table public.n8n_collection_policies
  add constraint n8n_collection_policies_single_scope_ck
  check (not (client_id is not null and loan_id is not null));

drop index if exists public.n8n_collection_policy_profile_default_ux;

create unique index if not exists n8n_collection_policy_profile_default_ux
  on public.n8n_collection_policies(profile_id)
  where client_id is null and loan_id is null;

create unique index if not exists n8n_collection_policy_profile_client_ux
  on public.n8n_collection_policies(profile_id, client_id)
  where client_id is not null and loan_id is null;

create index if not exists n8n_collection_policies_profile_scope_idx
  on public.n8n_collection_policies(profile_id, client_id, loan_id);

create or replace function public.rpc_has_whatsapp_automation(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.perfis p
      where p.id = p_profile_id
        and (
          p.user_id = (select auth.uid())
          or p.email = (select auth.jwt() ->> 'email')
          or p.usuario_email = (select auth.jwt() ->> 'email')
        )
    )
    and (
      exists (
        select 1
        from public.n8n_automation_integrations i
        where i.profile_id = p_profile_id
          and i.active = true
      )
      or exists (
        select 1
        from public.whatsapp_configs w
        where w.profile_id = p_profile_id
          and nullif(trim(w.token), '') is not null
          and nullif(trim(w.instance_id), '') is not null
      )
    );
$$;

revoke all on function public.rpc_has_whatsapp_automation(uuid) from public, anon;
grant execute on function public.rpc_has_whatsapp_automation(uuid) to authenticated;
