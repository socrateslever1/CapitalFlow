-- Personal encrypted wallet vault. Compatible with version-1 password vaults and
-- version-2 master-key vaults unlocked by one account PIN. No raw PAN/CVC stored in SQL.
BEGIN;

ALTER TABLE public.personal_wallet_cards
  ADD COLUMN IF NOT EXISTS has_protected_data boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.personal_wallet_card_vault (
  card_id uuid PRIMARY KEY REFERENCES public.personal_wallet_cards(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_id uuid NOT NULL,
  last_four text NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  envelope jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id,context_id)
);
ALTER TABLE public.personal_wallet_card_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_wallet_card_vault FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS wallet_card_vault_owner ON public.personal_wallet_card_vault;
CREATE POLICY wallet_card_vault_owner ON public.personal_wallet_card_vault
  FOR ALL TO authenticated
  USING (owner_user_id=(SELECT auth.uid()) AND public.is_platform_super_admin())
  WITH CHECK (owner_user_id=(SELECT auth.uid()) AND public.is_platform_super_admin());

CREATE TABLE IF NOT EXISTS public.personal_wallet_pin_profiles (
  owner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wrapped_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.personal_wallet_pin_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_wallet_pin_profiles FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS wallet_pin_profile_owner ON public.personal_wallet_pin_profiles;
CREATE POLICY wallet_pin_profile_owner ON public.personal_wallet_pin_profiles
  FOR ALL TO authenticated
  USING (owner_user_id=(SELECT auth.uid()) AND public.is_platform_super_admin())
  WITH CHECK (owner_user_id=(SELECT auth.uid()) AND public.is_platform_super_admin());

CREATE OR REPLACE FUNCTION public.personal_wallet_get_pin_profile()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
DECLARE v_owner uuid := auth.uid(); v_profile jsonb;
BEGIN
  IF v_owner IS NULL OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Sem permissão para acessar o PIN da Carteira.';
  END IF;
  -- RLS applies to invoker. Direct table read is revoked from authenticated.
  SELECT wrapped_key INTO v_profile FROM public.personal_wallet_pin_profiles
    WHERE owner_user_id=v_owner;
  RETURN v_profile;
END $$;
-- SECURITY INVOKER requires SELECT grant; the table remains inaccessible via
-- public Data API since no grant is given. Use DEFINER below with strict owner
-- verification for access through RPC.
CREATE OR REPLACE FUNCTION public.personal_wallet_get_pin_profile()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_owner uuid := auth.uid(); v_profile jsonb;
BEGIN
  IF v_owner IS NULL OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Sem permissão para acessar a chave protegida.';
  END IF;
  SELECT wrapped_key INTO v_profile FROM public.personal_wallet_pin_profiles
  WHERE owner_user_id=v_owner;
  RETURN v_profile;
END $$;

CREATE OR REPLACE FUNCTION public.personal_wallet_set_pin_profile(p_wrapped_key jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_owner uuid:=auth.uid();
BEGIN
  IF v_owner IS NULL OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar PIN.';
  END IF;
  IF p_wrapped_key IS NULL OR jsonb_typeof(p_wrapped_key)<>'object'
     OR (p_wrapped_key - ARRAY['version','iterations','salt','iv','ciphertext']) <> '{}'::jsonb
     OR p_wrapped_key->>'version'<>'1'
     OR p_wrapped_key->>'iterations'<>'600000'
     OR coalesce(p_wrapped_key->>'salt','') !~ '^[A-Za-z0-9+/]{22}==$'
     OR coalesce(p_wrapped_key->>'iv','') !~ '^[A-Za-z0-9+/]{16}$'
     OR length(coalesce(p_wrapped_key->>'ciphertext','')) NOT BETWEEN 50 AND 130
     OR coalesce(p_wrapped_key->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$'
  THEN RAISE EXCEPTION 'Formato do PIN protegido inválido.'; END IF;
  -- First writer wins. A compromised session cannot silently replace the master
  -- key, corrupting all previously saved cards.
  INSERT INTO public.personal_wallet_pin_profiles(owner_user_id,wrapped_key)
  VALUES(v_owner,p_wrapped_key) ON CONFLICT(owner_user_id) DO NOTHING;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_validate_protected_card_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_entry public.personal_wallet_card_vault%rowtype;
BEGIN
  SELECT * INTO v_entry FROM public.personal_wallet_card_vault WHERE card_id=new.id;
  IF FOUND AND (new.owner_user_id<>v_entry.owner_user_id
     OR new.last_four IS DISTINCT FROM v_entry.last_four
     OR NOT new.has_protected_data) THEN
    RAISE EXCEPTION 'O final do cartão protegido deve ser alterado no cofre.';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.wallet_validate_protected_card_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_wallet_protected_card_identity ON public.personal_wallet_cards;
CREATE TRIGGER trg_wallet_protected_card_identity
  BEFORE UPDATE OF last_four,has_protected_data,owner_user_id
  ON public.personal_wallet_cards FOR EACH ROW
  EXECUTE FUNCTION public.wallet_validate_protected_card_identity();

CREATE OR REPLACE FUNCTION public.personal_wallet_get_card_vault(p_card_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_owner uuid:=auth.uid(); v_envelope jsonb;
BEGIN
  IF v_owner IS NULL OR NOT public.is_platform_super_admin()
     OR NOT EXISTS (SELECT 1 FROM public.personal_wallet_cards
       WHERE id=p_card_id AND owner_user_id=v_owner AND status IN ('ACTIVE','BLOCKED'))
  THEN RAISE EXCEPTION 'Cartão indisponível ou não autorizado.'; END IF;
  SELECT envelope INTO v_envelope FROM public.personal_wallet_card_vault
  WHERE card_id=p_card_id AND owner_user_id=v_owner;
  RETURN v_envelope;
END $$;

CREATE OR REPLACE FUNCTION public.personal_wallet_save_card_vault(
  p_card_id uuid,p_envelope jsonb,p_last_four text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_owner uuid:=auth.uid(); v_card public.personal_wallet_cards%rowtype;
  v_context uuid; v_version int;
BEGIN
  IF v_owner IS NULL OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Sem permissão para salvar dados protegidos.'; END IF;
  SELECT * INTO v_card FROM public.personal_wallet_cards
    WHERE id=p_card_id AND owner_user_id=v_owner AND status IN ('ACTIVE','BLOCKED') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado.'; END IF;
  IF p_last_four IS NULL OR p_last_four!~'^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Final do cartão inválido.'; END IF;
  IF p_envelope IS NULL OR jsonb_typeof(p_envelope)<>'object' OR
     coalesce(p_envelope->>'version','') !~ '^[12]$' THEN
    RAISE EXCEPTION 'Envelope criptografado inválido.'; END IF;
  v_version:=(p_envelope->>'version')::int;
  IF (v_version=1 AND
       (p_envelope-ARRAY['version','algorithm','iterations','salt','iv','ciphertext','context_id'])<>'{}'::jsonb)
     OR (v_version=2 AND
       (p_envelope-ARRAY['version','algorithm','iv','ciphertext','context_id'])<>'{}'::jsonb)
     OR p_envelope->>'algorithm'<>'AES-GCM'
     OR (v_version=1 AND (p_envelope->>'iterations'<>'600000'
       OR coalesce(p_envelope->>'salt','')!~'^[A-Za-z0-9+/]{22}==$'))
     OR coalesce(p_envelope->>'iv','')!~'^[A-Za-z0-9+/]{16}$'
     OR coalesce(p_envelope->>'ciphertext','')!~'^[A-Za-z0-9+/]+={0,2}$'
     OR length(coalesce(p_envelope->>'ciphertext','')) NOT BETWEEN 24 AND 4096
     OR coalesce(p_envelope->>'context_id','')!~'^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION 'Formato de dados protegidos inválido.'; END IF;
  v_context:=(p_envelope->>'context_id')::uuid;
  IF v_context<>v_card.id AND v_context IS DISTINCT FROM v_card.opening_request_id THEN
    RAISE EXCEPTION 'Este cofre não pertence ao cartão informado.'; END IF;
  IF v_version=2 AND NOT EXISTS (SELECT 1 FROM public.personal_wallet_pin_profiles
    WHERE owner_user_id=v_owner) THEN
    RAISE EXCEPTION 'Configure o PIN da Carteira antes de salvar.'; END IF;
  IF EXISTS(SELECT 1 FROM public.personal_wallet_card_vault
     WHERE card_id=p_card_id AND context_id<>v_context) THEN
    RAISE EXCEPTION 'O contexto original do cofre deve ser mantido.'; END IF;
  INSERT INTO public.personal_wallet_card_vault(card_id,owner_user_id,context_id,last_four,envelope)
  VALUES(p_card_id,v_owner,v_context,p_last_four,p_envelope)
  ON CONFLICT(card_id) DO UPDATE SET
    envelope=excluded.envelope,last_four=excluded.last_four,updated_at=now();
  UPDATE public.personal_wallet_cards SET
    has_protected_data=true,last_four=p_last_four,updated_at=now()
  WHERE id=p_card_id AND owner_user_id=v_owner;
END $$;

REVOKE ALL ON FUNCTION public.personal_wallet_get_pin_profile() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.personal_wallet_set_pin_profile(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.personal_wallet_get_card_vault(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.personal_wallet_save_card_vault(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_get_pin_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.personal_wallet_set_pin_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.personal_wallet_get_card_vault(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.personal_wallet_save_card_vault(uuid,jsonb,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
