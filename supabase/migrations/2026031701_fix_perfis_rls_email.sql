-- migration: 20260317_fix_perfis_rls_email.sql
-- Objetivo: Permitir que usuários vinculem seus perfis se o e-mail coincidir com o do Auth.

DROP POLICY IF EXISTS "Usuários podem ver perfil via email" ON public.perfis;
CREATE POLICY "Usuários podem ver perfil via email"
ON public.perfis FOR SELECT
TO authenticated
USING (email = auth.jwt() ->> 'email' OR usuario_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS "Usuários podem atualizar perfil via email" ON public.perfis;
CREATE POLICY "Usuários podem atualizar perfil via email"
ON public.perfis FOR UPDATE
TO authenticated
USING (email = auth.jwt() ->> 'email' OR usuario_email = auth.jwt() ->> 'email')
WITH CHECK (email = auth.jwt() ->> 'email' OR usuario_email = auth.jwt() ->> 'email');
