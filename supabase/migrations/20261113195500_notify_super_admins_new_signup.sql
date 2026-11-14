-- Notifica contas SUPER_ADMIN em public.notificacoes quando um novo perfil se cadastra.
CREATE OR REPLACE FUNCTION public.notify_super_admins_on_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_email text;
  v_message text;
BEGIN
  v_name := COALESCE(
    NULLIF(BTRIM(NEW.nome_completo), ''),
    NULLIF(BTRIM(NEW.nome_operador), ''),
    NULLIF(BTRIM(NEW.usuario_email), ''),
    'Novo usuário'
  );
  v_email := NULLIF(BTRIM(NEW.usuario_email), '');
  v_message := CASE
    WHEN v_email IS NOT NULL AND LOWER(v_name) <> LOWER(v_email) THEN
      format('%s (%s) acabou de se cadastrar no sistema.', v_name, v_email)
    ELSE
      format('%s acabou de se cadastrar no sistema.', v_name)
  END;

  INSERT INTO public.notificacoes (
    profile_id,
    titulo,
    mensagem,
    item_type,
    item_id,
    metadata
  )
  SELECT DISTINCT
    admin_profile.id,
    'Novo cadastro no sistema',
    v_message,
    'admin_signup',
    NEW.id,
    jsonb_build_object(
      'new_profile_id', NEW.id,
      'nome', v_name,
      'email', v_email
    )
  FROM public.platform_admins pa
  JOIN public.perfis admin_profile
    ON admin_profile.user_id = pa.user_id
    OR admin_profile.id = pa.user_id
  WHERE pa.role = 'SUPER_ADMIN'
    AND admin_profile.id IS DISTINCT FROM NEW.id
    AND (NEW.user_id IS NULL OR pa.user_id IS DISTINCT FROM NEW.user_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_super_admins_on_new_profile ON public.perfis;
CREATE TRIGGER trg_notify_super_admins_on_new_profile
  AFTER INSERT ON public.perfis
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_super_admins_on_new_profile();

