-- Registra aceite único e auditável dos Termos de Uso e Isenção de Responsabilidade.

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;

CREATE TABLE IF NOT EXISTS public.termos_aceites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.perfis(id) ON DELETE CASCADE,
  user_id uuid,
  email text,
  full_name text,
  terms_version text NOT NULL,
  terms_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  origin text NOT NULL DEFAULT 'WEB'
);

CREATE INDEX IF NOT EXISTS idx_termos_aceites_profile_version
  ON public.termos_aceites (profile_id, terms_version, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_termos_aceites_user_version
  ON public.termos_aceites (user_id, terms_version, accepted_at DESC);

ALTER TABLE public.termos_aceites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS termos_aceites_select_own_or_admin ON public.termos_aceites;
CREATE POLICY termos_aceites_select_own_or_admin
  ON public.termos_aceites
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.perfis p
       WHERE p.id = termos_aceites.profile_id
         AND (p.user_id = auth.uid() OR p.id = auth.uid())
    )
    OR public.is_platform_super_admin()
  );

DROP POLICY IF EXISTS termos_aceites_insert_own ON public.termos_aceites;
CREATE POLICY termos_aceites_insert_own
  ON public.termos_aceites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.perfis p
       WHERE p.id = termos_aceites.profile_id
         AND (p.user_id = auth.uid() OR p.id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.accept_platform_terms(
  p_terms_version text,
  p_terms_hash text,
  p_user_agent text DEFAULT NULL,
  p_origin text DEFAULT 'WEB'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.perfis%rowtype;
  v_now timestamptz := now();
  v_existing_id uuid;
  v_name text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_terms_version, '')), '') IS NULL
     OR NULLIF(BTRIM(COALESCE(p_terms_hash, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Versão e hash dos termos são obrigatórios.';
  END IF;

  SELECT *
    INTO v_profile
    FROM public.perfis p
   WHERE p.user_id = v_uid OR p.id = v_uid
   ORDER BY (p.user_id = v_uid) DESC, p.created_at ASC NULLS LAST
   LIMIT 1;

  IF v_profile.id IS NOT NULL THEN
    SELECT id
      INTO v_existing_id
      FROM public.termos_aceites
     WHERE profile_id = v_profile.id
       AND terms_version = BTRIM(p_terms_version)
     ORDER BY accepted_at DESC
     LIMIT 1;
  END IF;

  v_name := COALESCE(
    NULLIF(BTRIM(v_profile.nome_completo), ''),
    NULLIF(BTRIM(v_profile.nome_operador), ''),
    'Usuário'
  );
  v_email := COALESCE(
    NULLIF(BTRIM(v_profile.usuario_email), ''),
    NULLIF(BTRIM(v_profile.email), '')
  );

  IF v_existing_id IS NULL THEN
    INSERT INTO public.termos_aceites (
      profile_id,
      user_id,
      email,
      full_name,
      terms_version,
      terms_hash,
      accepted_at,
      user_agent,
      origin
    ) VALUES (
      v_profile.id,
      v_uid,
      v_email,
      v_name,
      BTRIM(p_terms_version),
      BTRIM(p_terms_hash),
      v_now,
      LEFT(NULLIF(BTRIM(COALESCE(p_user_agent, '')), ''), 500),
      COALESCE(NULLIF(BTRIM(COALESCE(p_origin, '')), ''), 'WEB')
    )
    RETURNING id INTO v_existing_id;
  END IF;

  IF v_profile.id IS NOT NULL THEN
    UPDATE public.perfis
       SET terms_accepted_at = COALESCE(terms_accepted_at, v_now),
           terms_version = BTRIM(p_terms_version)
     WHERE id = v_profile.id;
  END IF;

  RETURN jsonb_build_object(
    'accepted', true,
    'acceptance_id', v_existing_id,
    'terms_version', BTRIM(p_terms_version),
    'accepted_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_platform_terms(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_platform_terms(text, text, text, text) TO authenticated;

