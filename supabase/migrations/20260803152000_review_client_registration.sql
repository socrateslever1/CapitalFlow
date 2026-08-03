SET search_path = public;

CREATE OR REPLACE FUNCTION public.review_client_registration(
  p_client_id uuid,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text := upper(trim(COALESCE(p_status, '')));
  v_client public.clientes%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessao expirada. Entre novamente.';
  END IF;

  IF v_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Resultado da analise invalido.';
  END IF;

  SELECT client.*
  INTO v_client
  FROM public.clientes client
  WHERE client.id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro nao encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfis target
    JOIN public.perfis requester ON requester.user_id = v_user_id
    WHERE target.id = v_client.owner_id
      AND (
        requester.id = target.id
        OR COALESCE(requester.owner_profile_id, requester.supervisor_id, requester.id)
          = COALESCE(target.owner_profile_id, target.supervisor_id, target.id)
      )
  ) THEN
    RAISE EXCEPTION 'Perfil nao autorizado para analisar este cadastro.';
  END IF;

  UPDATE public.clientes
  SET registration_status = v_status
  WHERE id = p_client_id;

  RETURN jsonb_build_object('client_id', p_client_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_client_registration(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_client_registration(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
