drop function if exists public.platform_admin_list_profiles();

create function public.platform_admin_list_profiles()
returns table(
  id uuid,
  user_id uuid,
  email text,
  name text,
  access_level integer,
  created_at timestamptz,
  last_active_at timestamptz,
  is_super_admin boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    coalesce(u.email, p.usuario_email),
    p.nome_operador,
    p.access_level,
    p.created_at,
    p.last_active_at,
    exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = p.user_id
        and pa.role = 'SUPER_ADMIN'
    ) as is_super_admin
  from public.perfis p
  left join auth.users u on u.id = p.user_id
  where public.is_platform_super_admin()
  order by p.created_at desc;
$$;

revoke all on function public.platform_admin_list_profiles() from public, anon;
grant execute on function public.platform_admin_list_profiles() to authenticated;

notify pgrst, 'reload schema';
