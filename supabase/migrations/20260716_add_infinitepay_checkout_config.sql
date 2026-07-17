SET search_path = public;

CREATE TABLE IF NOT EXISTS public.perfis_config_infinitepay (
  profile_id uuid PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  infinitepay_handle text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.perfis_config_infinitepay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gerenciar chaves InfinitePay via email" ON public.perfis_config_infinitepay;

CREATE POLICY "Gerenciar chaves InfinitePay via email"
  ON public.perfis_config_infinitepay
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.perfis
      WHERE user_id = (SELECT auth.uid())
         OR email = (SELECT auth.jwt() ->> 'email')
         OR usuario_email = (SELECT auth.jwt() ->> 'email')
         OR id IN (
           SELECT supervisor_id
           FROM public.perfis
           WHERE user_id = (SELECT auth.uid())
             AND supervisor_id IS NOT NULL
         )
         OR supervisor_id IN (
           SELECT id
           FROM public.perfis
           WHERE user_id = (SELECT auth.uid())
         )
    )
  )
  WITH CHECK (
    profile_id IN (
      SELECT id FROM public.perfis
      WHERE user_id = (SELECT auth.uid())
         OR email = (SELECT auth.jwt() ->> 'email')
         OR usuario_email = (SELECT auth.jwt() ->> 'email')
         OR id IN (
           SELECT supervisor_id
           FROM public.perfis
           WHERE user_id = (SELECT auth.uid())
             AND supervisor_id IS NOT NULL
         )
         OR supervisor_id IN (
           SELECT id
           FROM public.perfis
           WHERE user_id = (SELECT auth.uid())
         )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfis_config_infinitepay TO authenticated;

NOTIFY pgrst, 'reload schema';
