-- Corrige policies RLS do fluxo de acordos/unificacao.
-- O app usa public.perfis.id como profile_id; auth.uid() pode ser o auth.users.id.

ALTER TABLE public.acordos_inadimplencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_parcelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gerenciar acordos pelo perfil autenticado" ON public.acordos_inadimplencia;
CREATE POLICY "Gerenciar acordos pelo perfil autenticado"
ON public.acordos_inadimplencia
FOR ALL
TO authenticated
USING (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.id = auth.uid()
       OR p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
  )
)
WITH CHECK (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.id = auth.uid()
       OR p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
  )
);

DROP POLICY IF EXISTS "Gerenciar parcelas de acordo pelo perfil autenticado" ON public.acordo_parcelas;
CREATE POLICY "Gerenciar parcelas de acordo pelo perfil autenticado"
ON public.acordo_parcelas
FOR ALL
TO authenticated
USING (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.id = auth.uid()
       OR p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
  )
)
WITH CHECK (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.id = auth.uid()
       OR p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
  )
);
