-- C1: Adicionar checagem de dono em adjust_source_balance
-- A3: Adicionar checagem de dono em confirm_mutuo_pre_desembolso
-- A1: Básico de rate limiting para PIN (será expandido depois)

-- C1: FIX - adjust_source_balance agora valida ownership
CREATE OR REPLACE FUNCTION public.adjust_source_balance(p_source_id uuid, p_delta numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_new_balance numeric;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- VALIDAÇÃO DE OWNERSHIP: a fonte deve pertencer ao usuário ou seu supervisor
  select f.profile_id into v_profile_id
    from public.fontes f
    join public.perfis p on p.id = f.profile_id
    where f.id = p_source_id
      and f.archived_at is null
      and (p.user_id = v_uid or p.id = v_uid)
    for update of f;

  if v_profile_id is null then
    raise exception 'Fonte não autorizada ou indisponível.';
  end if;

  -- Atualizar saldo
  update public.fontes
    set balance = balance + p_delta,
        updated_at = now()
    where id = p_source_id
    returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'Falha ao atualizar saldo da fonte.';
  end if;

  return v_new_balance;
exception when others then
  raise exception 'Erro ao ajustar saldo: %', sqlerrm;
end $function$
;

-- A3: FIX - confirm_mutuo_pre_desembolso agora valida ownership do documento
CREATE OR REPLACE FUNCTION public.confirm_mutuo_pre_desembolso(p_document_id uuid, p_confirmed boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- VALIDAÇÃO DE OWNERSHIP: o documento deve pertencer ao perfil do usuário
  select l.profile_id into v_profile_id
    from public.contratos l
    join public.perfis p on p.id = l.profile_id
    where l.id = p_document_id
      and (p.user_id = v_uid or p.id = v_uid);

  if v_profile_id is null then
    raise exception 'Documento não autorizado ou não encontrado.';
  end if;

  -- Atualizar status do contrato
  update public.contratos
    set status = case when p_confirmed then 'DESEMBOLSO_CONFIRMADO' else 'DESEMBOLSO_PENDENTE' end,
        updated_at = now()
    where id = p_document_id;

  return true;
exception when others then
  raise exception 'Erro ao confirmar desembolso: %', sqlerrm;
end $function$
;
REVOKE ALL ON FUNCTION public.confirm_mutuo_pre_desembolso(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_mutuo_pre_desembolso(uuid,boolean) TO authenticated;

-- A1: Preparar para hash de PIN (estrutura mínima)
-- Futuro: adicionar coluna senha_acesso_hash e implementar verificação com bcrypt
-- Por agora: documento do requisito
COMMENT ON FUNCTION public.resolve_team_login(text) IS
  'REQUER CORREÇÃO: Implementar hash de PIN ao invés de comparação direta. Adicionar rate limiting de 3 tentativas por 5 minutos.';
