-- Harden administrative password reset without changing session lifetime.

CREATE OR REPLACE FUNCTION public.admin_set_profile_password(p_email text, p_new_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_target_id uuid;
    v_requester_level int;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    SELECT p.access_level
      INTO v_requester_level
      FROM public.perfis p
     WHERE p.user_id = auth.uid() OR p.id = auth.uid()
     ORDER BY CASE WHEN p.user_id = auth.uid() THEN 0 ELSE 1 END
     LIMIT 1;

    IF COALESCE(v_requester_level, 999) <> 1 THEN
        RAISE EXCEPTION 'Acesso administrativo obrigatório.';
    END IF;

    IF COALESCE(length(trim(p_new_password)), 0) < 4 THEN
        RAISE EXCEPTION 'Senha inválida.';
    END IF;

    UPDATE public.perfis
       SET senha_acesso = TRIM(p_new_password),
           last_active_at = NOW()
     WHERE LOWER(usuario_email) = LOWER(TRIM(p_email))
        OR LOWER(email) = LOWER(TRIM(p_email))
    RETURNING id INTO v_target_id;

    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado com este email.';
    END IF;

    RETURN 'Senha atualizada com sucesso.';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_profile_password(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_password(text,text) TO authenticated;
