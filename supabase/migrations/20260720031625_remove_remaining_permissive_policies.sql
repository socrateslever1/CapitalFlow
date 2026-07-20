SET search_path = public;

DROP POLICY IF EXISTS "Serviço pode gerenciar documentos" ON public.documentos_juridicos;
DROP POLICY IF EXISTS "Permitir inserção anon mensagens" ON public.mensagens_suporte;

NOTIFY pgrst, 'reload schema';
