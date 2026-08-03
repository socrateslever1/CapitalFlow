SET search_path = public;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cpf_in_identity boolean NOT NULL DEFAULT false;

ALTER TABLE public.client_registration_documents
  DROP CONSTRAINT IF EXISTS client_registration_documents_document_type_check;

ALTER TABLE public.client_registration_documents
  ADD CONSTRAINT client_registration_documents_document_type_check
  CHECK (document_type IN ('IDENTIDADE', 'RG', 'RG_CPF', 'CPF', 'COMPROVANTE_RESIDENCIA', 'RENDA', 'OUTRO'));

NOTIFY pgrst, 'reload schema';
