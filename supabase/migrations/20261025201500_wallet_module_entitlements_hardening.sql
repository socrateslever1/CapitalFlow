-- WalletModule SaaS access: self-service feature activation is prohibited.
-- Only privileged backend administration may change module entitlements.
BEGIN;
REVOKE INSERT,UPDATE,DELETE ON public.user_modulos FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.user_modulos FROM anon;
DROP POLICY IF EXISTS user_modulos_insert_own ON public.user_modulos;
DROP POLICY IF EXISTS user_modulos_update_own ON public.user_modulos;
DROP POLICY IF EXISTS user_modulos_delete_own ON public.user_modulos;
ALTER TABLE public.user_modulos ENABLE ROW LEVEL SECURITY;
-- Keep read access strictly to the authenticated row owner.
DROP POLICY IF EXISTS user_modulos_select_own ON public.user_modulos;
CREATE POLICY user_modulos_select_own ON public.user_modulos
  FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
GRANT SELECT ON public.user_modulos TO authenticated;
COMMIT;
