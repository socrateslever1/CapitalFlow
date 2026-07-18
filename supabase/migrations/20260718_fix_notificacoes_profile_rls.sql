-- Corrige as políticas RLS da central de notificações.
-- notificacoes.profile_id referencia public.perfis.id, enquanto auth.uid()
-- referencia auth.users.id. A autorização deve passar pela tabela perfis.

SET search_path = public;

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notificacoes_select_own ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_insert_own ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_update_own ON public.notificacoes;

CREATE POLICY notificacoes_select_own
ON public.notificacoes
FOR SELECT
TO authenticated
USING (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
       OR p.id IN (
         SELECT p2.supervisor_id
         FROM public.perfis p2
         WHERE p2.user_id = auth.uid()
           AND p2.supervisor_id IS NOT NULL
       )
       OR p.supervisor_id IN (
         SELECT p3.id
         FROM public.perfis p3
         WHERE p3.user_id = auth.uid()
       )
  )
);

CREATE POLICY notificacoes_insert_own
ON public.notificacoes
FOR INSERT
TO authenticated
WITH CHECK (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
       OR p.id IN (
         SELECT p2.supervisor_id
         FROM public.perfis p2
         WHERE p2.user_id = auth.uid()
           AND p2.supervisor_id IS NOT NULL
       )
       OR p.supervisor_id IN (
         SELECT p3.id
         FROM public.perfis p3
         WHERE p3.user_id = auth.uid()
       )
  )
);

CREATE POLICY notificacoes_update_own
ON public.notificacoes
FOR UPDATE
TO authenticated
USING (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
       OR p.id IN (
         SELECT p2.supervisor_id
         FROM public.perfis p2
         WHERE p2.user_id = auth.uid()
           AND p2.supervisor_id IS NOT NULL
       )
       OR p.supervisor_id IN (
         SELECT p3.id
         FROM public.perfis p3
         WHERE p3.user_id = auth.uid()
       )
  )
)
WITH CHECK (
  profile_id IN (
    SELECT p.id
    FROM public.perfis p
    WHERE p.user_id = auth.uid()
       OR p.email = auth.jwt() ->> 'email'
       OR p.usuario_email = auth.jwt() ->> 'email'
       OR p.id IN (
         SELECT p2.supervisor_id
         FROM public.perfis p2
         WHERE p2.user_id = auth.uid()
           AND p2.supervisor_id IS NOT NULL
       )
       OR p.supervisor_id IN (
         SELECT p3.id
         FROM public.perfis p3
         WHERE p3.user_id = auth.uid()
       )
  )
);

NOTIFY pgrst, 'reload schema';
