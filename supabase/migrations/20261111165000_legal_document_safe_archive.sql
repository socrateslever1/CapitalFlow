-- Arquivo de exibição exclusivo do titular: nenhuma assinatura ou minuta é alterada.
CREATE TABLE IF NOT EXISTS public.legal_document_archive_state (
  document_id uuid NOT NULL REFERENCES public.documentos_juridicos(id) ON DELETE CASCADE,
  owner_auth_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id,owner_auth_id)
);
ALTER TABLE public.legal_document_archive_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_document_archive_state FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.legal_document_archive_state TO authenticated;
DROP POLICY IF EXISTS legal_document_archive_self_select ON public.legal_document_archive_state;
CREATE POLICY legal_document_archive_self_select ON public.legal_document_archive_state
  FOR SELECT TO authenticated
  USING (
    owner_auth_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documentos_juridicos d
      JOIN public.perfis p ON p.id=d.profile_id
      WHERE d.id=document_id AND p.user_id=(SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS legal_document_archive_self_insert ON public.legal_document_archive_state;
CREATE POLICY legal_document_archive_self_insert ON public.legal_document_archive_state
  FOR INSERT TO authenticated WITH CHECK (
    owner_auth_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documentos_juridicos d
      JOIN public.perfis p ON p.id=d.profile_id
      WHERE d.id=document_id AND p.user_id=(SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS legal_document_archive_self_delete ON public.legal_document_archive_state;
CREATE POLICY legal_document_archive_self_delete ON public.legal_document_archive_state
  FOR DELETE TO authenticated USING (
    owner_auth_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documentos_juridicos d
      JOIN public.perfis p ON p.id=d.profile_id
      WHERE d.id=document_id AND p.user_id=(SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS legal_document_archive_self_update ON public.legal_document_archive_state;
CREATE POLICY legal_document_archive_self_update ON public.legal_document_archive_state
  FOR UPDATE TO authenticated
  USING (
    owner_auth_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documentos_juridicos d
      JOIN public.perfis p ON p.id=d.profile_id
      WHERE d.id=document_id AND p.user_id=(SELECT auth.uid())
    )
  )
  WITH CHECK (
    owner_auth_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documentos_juridicos d
      JOIN public.perfis p ON p.id=d.profile_id
      WHERE d.id=document_id AND p.user_id=(SELECT auth.uid())
    )
  );

-- Reforça no próprio banco a preservação de provas. Nunca elimina registros existentes.
CREATE OR REPLACE FUNCTION public.block_legal_doc_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF OLD.status_assinatura IS DISTINCT FROM 'PENDENTE'
     OR OLD.signed_at IS NOT NULL OR OLD.locked_at IS NOT NULL
     OR OLD.uploaded_signed_file_path IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.assinaturas_documento a WHERE a.document_id=OLD.id)
     OR EXISTS (SELECT 1 FROM public.acordos_inadimplencia a WHERE a.legal_document_id=OLD.id)
  THEN
    RAISE EXCEPTION 'Documento protegido ou com assinatura: arquive sem destruir o registro jurídico.';
  END IF;
  RETURN OLD;
END;
$$;
