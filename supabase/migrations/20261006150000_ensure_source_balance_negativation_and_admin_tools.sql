-- Migration 20261006150000: Garante negativacao operacional de fontes e ferramentas de gestao do dono da plataforma

-- 1. Garante que a RPC adjust_source_balance debita livremente sem bloquear saldo negativo
create or replace function public.adjust_source_balance(
  p_source_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
begin
  update public.fontes
  set balance = round(coalesce(balance, 0) + p_delta, 2)
  where id = p_source_id;
end;
$$;

revoke all on function public.adjust_source_balance(uuid, numeric) from public, anon;
grant execute on function public.adjust_source_balance(uuid, numeric) to authenticated, service_role;

comment on function public.adjust_source_balance(uuid, numeric) is
  'Ajusta o saldo da fonte permitindo saldo negativo para saidas operacionais e rastreabilidade.';

-- 2. Permite ao Dono da Plataforma (Super Admin) gerenciar o nivel de acesso e bloqueio de operadores
create or replace function public.platform_admin_set_access_level(
  p_profile_id uuid,
  p_access_level integer
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = (select auth.uid()) and role = 'SUPER_ADMIN') then
    raise exception 'Acesso negado.';
  end if;

  update public.perfis
  set access_level = p_access_level,
      last_active_at = now()
  where id = p_profile_id;

  return true;
end;
$$;

revoke all on function public.platform_admin_set_access_level(uuid, integer) from public, anon;
grant execute on function public.platform_admin_set_access_level(uuid, integer) to authenticated;

comment on function public.platform_admin_set_access_level(uuid, integer) is
  'Permite ao Dono da Plataforma definir nivel de acesso ou bloquear/suspender operadores (access_level = 0).';
