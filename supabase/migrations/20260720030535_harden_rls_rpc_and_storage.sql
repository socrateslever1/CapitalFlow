SET search_path = public;

-- Remove policies that granted unrestricted access to financial, legal and support data.
DROP POLICY IF EXISTS "Enable ALL for authenticated users" ON public.acordo_parcelas;
DROP POLICY IF EXISTS "Enable ALL for authenticated users" ON public.acordos_inadimplencia;
DROP POLICY IF EXISTS "Escrita Assinaturas" ON public.assinaturas_documento;
DROP POLICY IF EXISTS "Leitura Assinaturas Publica" ON public.assinaturas_documento;
DROP POLICY IF EXISTS "Portal - Select by id" ON public.documentos_juridicos;
DROP POLICY IF EXISTS "Serviço pode gerenciar documentos" ON public.documentos_juridicos;
DROP POLICY IF EXISTS "Acesso Docs" ON public.documentos_juridicos;

DROP POLICY IF EXISTS "Acesso anonimo para mensagens_suporte (DELETE)" ON public.mensagens_suporte;
DROP POLICY IF EXISTS "Acesso anonimo para mensagens_suporte (INSERT)" ON public.mensagens_suporte;
DROP POLICY IF EXISTS "Acesso anonimo para mensagens_suporte (SELECT)" ON public.mensagens_suporte;
DROP POLICY IF EXISTS "Acesso anonimo para mensagens_suporte (UPDATE)" ON public.mensagens_suporte;
DROP POLICY IF EXISTS "Permitir inserção anon mensagens" ON public.mensagens_suporte;
DROP POLICY IF EXISTS "Permitir leitura anon mensagens" ON public.mensagens_suporte;
DROP POLICY IF EXISTS mensagens_suporte_client_insert ON public.mensagens_suporte;
DROP POLICY IF EXISTS mensagens_suporte_client_select ON public.mensagens_suporte;

DROP POLICY IF EXISTS "Acesso anonimo para support_presence (INSERT)" ON public.support_presence;
DROP POLICY IF EXISTS "Acesso anonimo para support_presence (SELECT)" ON public.support_presence;
DROP POLICY IF EXISTS "Acesso anonimo para support_presence (UPDATE)" ON public.support_presence;
DROP POLICY IF EXISTS "Permitir insert/update anon presence" ON public.support_presence;
DROP POLICY IF EXISTS "Permitir leitura anon presence" ON public.support_presence;

DROP POLICY IF EXISTS "Acesso anonimo para support_tickets (INSERT)" ON public.support_tickets;
DROP POLICY IF EXISTS "Acesso anonimo para support_tickets (SELECT)" ON public.support_tickets;
DROP POLICY IF EXISTS "Acesso anonimo para support_tickets (UPDATE)" ON public.support_tickets;
DROP POLICY IF EXISTS "Permitir insert anon tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Permitir leitura anon tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Permitir update anon tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Acesso Tickets" ON public.support_tickets;

REVOKE ALL ON TABLE
  public.assinaturas_documento,
  public.documentos_juridicos,
  public.mensagens_suporte,
  public.support_presence,
  public.support_tickets
FROM anon;

DROP POLICY IF EXISTS legal_documents_owner_all ON public.documentos_juridicos;
CREATE POLICY legal_documents_owner_all ON public.documentos_juridicos
FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS legal_signatures_owner_all ON public.assinaturas_documento;
CREATE POLICY legal_signatures_owner_all ON public.assinaturas_documento
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.documentos_juridicos d
    WHERE d.id = assinaturas_documento.document_id
      AND d.profile_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documentos_juridicos d
    WHERE d.id = assinaturas_documento.document_id
      AND d.profile_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS support_messages_owner_all ON public.mensagens_suporte;
CREATE POLICY support_messages_owner_all ON public.mensagens_suporte
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = mensagens_suporte.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = mensagens_suporte.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS support_presence_owner_all_v2 ON public.support_presence;
CREATE POLICY support_presence_owner_all_v2 ON public.support_presence
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = support_presence.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = support_presence.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS support_tickets_owner_all_v2 ON public.support_tickets;
CREATE POLICY support_tickets_owner_all_v2 ON public.support_tickets
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = support_tickets.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = support_tickets.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

CREATE OR REPLACE FUNCTION public.portal_support_authorize(
  p_token text,
  p_shortcode text,
  p_loan_id uuid
) RETURNS public.contratos
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c
  FROM public.contratos c
  WHERE c.id = p_loan_id
    AND c.portal_token::text = p_token
    AND c.portal_shortcode = p_shortcode
    AND public.validate_portal_access(p_token, p_shortcode)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.portal_support_list_messages(
  p_token text,
  p_shortcode text,
  p_loan_id uuid
) RETURNS SETOF public.mensagens_suporte
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.*
  FROM public.mensagens_suporte m
  WHERE m.loan_id = p_loan_id
    AND EXISTS (
      SELECT 1 FROM public.portal_support_authorize(p_token, p_shortcode, p_loan_id)
    )
  ORDER BY m.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.portal_support_send_message(
  p_token text,
  p_shortcode text,
  p_loan_id uuid,
  p_content text,
  p_type text DEFAULT 'text',
  p_file_path text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract public.contratos%ROWTYPE;
  v_message_id uuid;
BEGIN
  SELECT * INTO v_contract
  FROM public.portal_support_authorize(p_token, p_shortcode, p_loan_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso ao portal invalido.' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(COALESCE(p_content, ''))) = 0 AND p_file_path IS NULL THEN
    RAISE EXCEPTION 'Mensagem vazia.' USING ERRCODE = '22023';
  END IF;

  IF length(COALESCE(p_content, '')) > 4000 THEN
    RAISE EXCEPTION 'Mensagem excede 4000 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_type NOT IN ('text', 'image', 'audio', 'file') THEN
    RAISE EXCEPTION 'Tipo de mensagem invalido.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.mensagens_suporte m
    WHERE m.loan_id = p_loan_id
      AND m.sender_type = 'CLIENT'
      AND m.created_at > now() - interval '1 minute'
  ) >= 20 THEN
    RAISE EXCEPTION 'Limite temporario de mensagens atingido.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.mensagens_suporte (
    profile_id, loan_id, sender, sender_type, sender_user_id,
    text, content, type, file_url, metadata, read, created_at
  ) VALUES (
    COALESCE(v_contract.owner_id, v_contract.profile_id),
    p_loan_id,
    'CLIENT',
    'CLIENT',
    v_contract.client_id,
    NULLIF(btrim(COALESCE(p_content, '')), ''),
    NULLIF(btrim(COALESCE(p_content, '')), ''),
    p_type,
    p_file_path,
    COALESCE(p_metadata, '{}'::jsonb),
    false,
    now()
  ) RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('success', true, 'id', v_message_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_support_mark_read(
  p_token text,
  p_shortcode text,
  p_loan_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_support_authorize(p_token, p_shortcode, p_loan_id)
  ) THEN
    RAISE EXCEPTION 'Acesso ao portal invalido.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.mensagens_suporte
  SET read = true, read_at = now()
  WHERE loan_id = p_loan_id
    AND sender_type = 'OPERATOR'
    AND COALESCE(read, false) = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_support_unread_count(
  p_token text,
  p_shortcode text,
  p_loan_id uuid
) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::integer
  FROM public.mensagens_suporte m
  WHERE m.loan_id = p_loan_id
    AND m.sender_type = 'OPERATOR'
    AND COALESCE(m.read, false) = false
    AND EXISTS (
      SELECT 1 FROM public.portal_support_authorize(p_token, p_shortcode, p_loan_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.portal_support_header(
  p_token text,
  p_shortcode text,
  p_loan_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'status', COALESCE((
      SELECT t.status::text FROM public.support_tickets t
      WHERE t.loan_id = p_loan_id ORDER BY t.created_at DESC LIMIT 1
    ), 'OPEN'),
    'is_online', COALESCE((
      SELECT max(sp.last_seen_at) > now() - interval '1 minute'
      FROM public.support_presence sp
      WHERE sp.loan_id = p_loan_id AND sp.role = 'OPERATOR'
    ), false)
  )
  WHERE EXISTS (
    SELECT 1 FROM public.portal_support_authorize(p_token, p_shortcode, p_loan_id)
  );
$$;

REVOKE ALL ON FUNCTION public.portal_support_authorize(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_support_list_messages(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_support_send_message(text, text, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_support_mark_read(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_support_unread_count(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_support_header(text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.portal_support_authorize(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_support_list_messages(text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_support_send_message(text, text, uuid, text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_support_mark_read(text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_support_unread_count(text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_support_header(text, text, uuid) TO anon, authenticated, service_role;

-- Private financial/legal buckets. Avatars remain public-read by design, but writes become authenticated.
UPDATE storage.buckets SET public = false WHERE id IN ('comprovantes', 'documentos');

DROP POLICY IF EXISTS "Anon Upload Comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Documentos" ON storage.objects;
DROP POLICY IF EXISTS "Leitura pública para chat" ON storage.objects;
DROP POLICY IF EXISTS "Upload chat publico" ON storage.objects;
DROP POLICY IF EXISTS "Upload público para chat" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Documentos" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_update ON storage.objects;
DROP POLICY IF EXISTS support_chat_insert_anon_loans ON storage.objects;
DROP POLICY IF EXISTS support_chat_read_anon_loans ON storage.objects;
DROP POLICY IF EXISTS "allow_read_support_chat 19h9knc_0" ON storage.objects;
DROP POLICY IF EXISTS "allow_upload_support_chat 19h9knc_0" ON storage.objects;

DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    ((storage.foldername(name))[1] = 'profiles'
      AND (storage.foldername(name))[2] IN (SELECT id::text FROM public.get_accessible_ids()))
    OR
    ((storage.foldername(name))[1] = 'clientes'
      AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id::text = (storage.foldername(name))[2]
          AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
      ))
  )
);

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    ((storage.foldername(name))[1] = 'profiles'
      AND (storage.foldername(name))[2] IN (SELECT id::text FROM public.get_accessible_ids()))
    OR
    ((storage.foldername(name))[1] = 'clientes'
      AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id::text = (storage.foldername(name))[2]
          AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
      ))
  )
)
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    ((storage.foldername(name))[1] = 'profiles'
      AND (storage.foldername(name))[2] IN (SELECT id::text FROM public.get_accessible_ids()))
    OR
    ((storage.foldername(name))[1] = 'clientes'
      AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id::text = (storage.foldername(name))[2]
          AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
      ))
  )
);

DROP POLICY IF EXISTS private_documents_owner_select ON storage.objects;
CREATE POLICY private_documents_owner_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.get_accessible_ids()
  )
);

DROP POLICY IF EXISTS private_documents_owner_insert ON storage.objects;
CREATE POLICY private_documents_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.get_accessible_ids()
  )
);

DROP POLICY IF EXISTS private_documents_owner_update ON storage.objects;
CREATE POLICY private_documents_owner_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.get_accessible_ids()
  )
)
WITH CHECK (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.get_accessible_ids()
  )
);

DROP POLICY IF EXISTS private_documents_owner_delete ON storage.objects;
CREATE POLICY private_documents_owner_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.get_accessible_ids()
  )
);

DROP POLICY IF EXISTS support_chat_owner_select ON storage.objects;
CREATE POLICY support_chat_owner_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'support_chat'
  AND (storage.foldername(name))[1] = 'loans'
  AND EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS support_chat_owner_insert ON storage.objects;
CREATE POLICY support_chat_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support_chat'
  AND (storage.foldername(name))[1] = 'loans'
  AND EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DO $search_paths$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proconfig IS NULL
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO public, extensions, pg_temp',
      v_function.signature
    );
  END LOOP;
END;
$search_paths$;

NOTIFY pgrst, 'reload schema';
