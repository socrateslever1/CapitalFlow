SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_client_registration_link(
  p_profile_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_token text;
  v_attempt integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessao expirada. Entre novamente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfis target
    JOIN public.perfis requester
      ON requester.user_id = v_user_id
    WHERE target.id = p_profile_id
      AND (
        requester.id = target.id
        OR COALESCE(requester.owner_profile_id, requester.supervisor_id, requester.id)
          = COALESCE(target.owner_profile_id, target.supervisor_id, target.id)
      )
  ) THEN
    RAISE EXCEPTION 'Perfil nao autorizado para criar inscricoes.';
  END IF;

  FOR v_attempt IN 1..3 LOOP
    v_token := gen_random_uuid()::text || replace(gen_random_uuid()::text, '-', '');
    BEGIN
      INSERT INTO public.client_registration_links (
        profile_id,
        token_hash,
        created_by
      ) VALUES (
        p_profile_id,
        encode(digest(v_token, 'sha256'), 'hex'),
        v_user_id
      );

      RETURN jsonb_build_object('token', v_token);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Nao foi possivel gerar um token unico.';
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_registration_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_client_registration_link(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
