-- Portal: validar dados, vínculo, estado e papel antes de assinar.
-- Alterações exclusivamente nas definições e permissões das funções; nenhuma linha existente é modificada.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.portal_sign_document(text,text,uuid,text,text,text,text,text,text,text,text,text,text,uuid)'::regprocedure)) <> '5c593a723bd30e09e31e579237b85e4d'
    OR md5(pg_get_functiondef('public.rpc_doc_missing_fields(uuid)'::regprocedure)) <> 'ef55e332f15369c94bcfb5cfcb1daa0f'
    OR md5(pg_get_functiondef('public.portal_patch_document_snapshot(text,text,uuid,jsonb)'::regprocedure)) <> '40fa63d517b3029c7c07d00f64523a08' THEN
    RAISE EXCEPTION 'Função de assinatura alterada no banco; refazer revisão antes de migrar';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.legal_document_missing_fields_v1(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $fields$
  SELECT coalesce(jsonb_agg(field ORDER BY ordinal), '[]'::jsonb)
  FROM unnest(ARRAY['creditorName','creditorDoc','debtorName','debtorDoc','amount','totalDebt','city','state']::text[]) WITH ORDINALITY AS required(field,ordinal)
  WHERE jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
     OR btrim(coalesce(p_snapshot ->> field,'')) = ''
$fields$;
REVOKE ALL ON FUNCTION public.legal_document_missing_fields_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legal_document_missing_fields_v1(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.portal_document_signing_check_v1(
  p_token text, p_shortcode text, p_documento_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $check$
DECLARE
  v_doc public.documentos_juridicos%rowtype;
  v_missing jsonb;
BEGIN
  IF p_documento_id IS NULL OR p_shortcode IS NULL OR btrim(p_shortcode) = ''
    OR p_token IS NULL
    OR p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN jsonb_build_object('can_sign',false,'missing','[]'::jsonb);
  END IF;

  SELECT d.* INTO v_doc
  FROM public.contratos c
  JOIN public.documentos_juridicos d ON d.loan_id=c.id
  WHERE c.portal_token=p_token::uuid
    AND c.portal_shortcode=p_shortcode
    AND c.id=d.loan_id
    AND d.id=p_documento_id
    AND (d.client_id IS NULL OR d.client_id=c.client_id)
    AND d.profile_id=c.owner_id
    AND c.portal_burned_at IS NULL
    AND public.portal_status_allows_access(c.status,c.is_archived)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_sign',false,'missing','[]'::jsonb);
  END IF;
  IF upper(coalesce(v_doc.status_assinatura,'')) NOT IN ('PENDENTE','EM_ASSINATURA')
    OR upper(coalesce(v_doc.status,'')) IN ('CANCELADO','CANCELED','CANCELLED','REJEITADO','REJECTED')
  THEN
    RETURN jsonb_build_object('can_sign',false,'missing','[]'::jsonb,'reason','DOCUMENT_NOT_SIGNABLE');
  END IF;
  v_missing := public.legal_document_missing_fields_v1(v_doc.snapshot);
  IF coalesce(v_doc.hash_sha256,'') !~* '^[0-9a-f]{64}$' THEN
    v_missing := v_missing || '["hash_sha256"]'::jsonb;
  END IF;
  IF coalesce(v_doc.snapshot ->> 'loanId','') <> ''
    AND v_doc.snapshot ->> 'loanId' <> v_doc.loan_id::text THEN
    v_missing := v_missing || '["loanId"]'::jsonb;
  END IF;
  IF coalesce(v_doc.tipo_documento,v_doc.tipo,'') NOT IN ('CONFISSAO','MUTUO_PRE_DESEMBOLSO') THEN
    v_missing := v_missing || '["tipo_documento"]'::jsonb;
  END IF;
  RETURN jsonb_build_object('can_sign',jsonb_array_length(v_missing)=0,'missing',v_missing);
END
$check$;
REVOKE ALL ON FUNCTION public.portal_document_signing_check_v1(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_document_signing_check_v1(text,text,uuid) TO anon,authenticated,service_role;

-- A antiga RPC só aceita consulta do próprio titular autenticado; nunca basta um ID.
CREATE OR REPLACE FUNCTION public.rpc_doc_missing_fields(p_documento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $owner$
DECLARE
  v_doc public.documentos_juridicos%rowtype;
  v_missing jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_documento_id IS NULL THEN
    RETURN jsonb_build_object('can_sign',false,'missing','[]'::jsonb);
  END IF;
  SELECT d.* INTO v_doc
  FROM public.documentos_juridicos d
  JOIN public.perfis p ON p.id=d.profile_id
  WHERE d.id=p_documento_id AND p.user_id=auth.uid()
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_sign',false,'missing','[]'::jsonb);
  END IF;
  v_missing := public.legal_document_missing_fields_v1(v_doc.snapshot);
  IF coalesce(v_doc.hash_sha256,'') !~* '^[0-9a-f]{64}$' THEN
    v_missing := v_missing || '["hash_sha256"]'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'missing',v_missing,
    'can_sign',
      jsonb_array_length(v_missing)=0
      AND upper(coalesce(v_doc.status_assinatura,'')) IN ('PENDENTE','EM_ASSINATURA')
      AND upper(coalesce(v_doc.status,'')) NOT IN ('CANCELADO','CANCELED','CANCELLED','REJEITADO','REJECTED')
  );
END
$owner$;
REVOKE ALL ON FUNCTION public.rpc_doc_missing_fields(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_doc_missing_fields(uuid) TO authenticated,service_role;

-- Substitui a implementação atual sem alterar nome, argumentos, defaults ou resultado.
CREATE OR REPLACE FUNCTION public.portal_sign_document(p_token text, p_shortcode text, p_documento_id uuid, p_papel text, p_nome text, p_cpf text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_ip text DEFAULT '0.0.0.0'::text, p_user_agent text DEFAULT ''::text, p_hash_assinado text DEFAULT NULL::text, p_client_timezone text DEFAULT NULL::text, p_document_version text DEFAULT NULL::text, p_portal_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_token_uuid uuid;
  v_client_id uuid;
  v_loan_id uuid;
  v_role_column text;
  v_role text;
  v_resolved_portal_token uuid;
  v_preflight jsonb;
  v_expected_name text;
  v_expected_document text;
  v_expected_version integer;
BEGIN
  -- Validar e converter token para UUID
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso invalido');
  END IF;

  -- Localizar o devedor e validar acesso
  SELECT client_id
  INTO v_client_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND public.portal_status_allows_access(status, is_archived)
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso invalido');
  END IF;

  -- Validar se o documento pertence a um contrato associado ao devedor
  SELECT d.loan_id
  INTO v_loan_id
  FROM documentos_juridicos d
  JOIN contratos l ON l.id::text = d.loan_id::text
  WHERE l.client_id = v_client_id
    AND d.id = p_documento_id
  LIMIT 1;

  IF v_loan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Documento nao encontrado');
  END IF;

  -- O token precisa corresponder ao MESMO contrato do documento.
  -- Verificação executada novamente no servidor, dentro da transação de assinatura.
  v_preflight := public.portal_document_signing_check_v1(p_token, p_shortcode, p_documento_id);
  IF NOT coalesce((v_preflight ->> 'can_sign')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Documento indisponivel para assinatura. Confira os dados e a situacao do contrato.');
  END IF;

  -- Detecta a coluna correspondente a papel/role na tabela assinaturas_documento
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'assinaturas_documento'
        AND column_name = 'papel'
    ) THEN 'papel'
    ELSE 'role'
  END
  INTO v_role_column;

  -- Normalização de papéis
  v_role := upper(trim(coalesce(p_papel, '')));
  IF v_role IN ('DEVEDOR', 'DEBTOR') THEN
    v_role := 'DEBTOR';
  ELSIF v_role IN ('CREDOR', 'CREDITOR') THEN
    v_role := 'CREDITOR';
  ELSIF v_role IN ('AVALISTA', 'GUARANTOR') THEN
    v_role := 'AVALISTA';
  ELSIF v_role LIKE 'TESTEMUNHA_%' THEN
    v_role := REPLACE(v_role, 'TESTEMUNHA_', 'WITNESS_');
  ELSIF v_role = 'TESTEMUNHA' OR v_role = 'WITNESS' THEN
    v_role := 'WITNESS_1';
  END IF;

  -- O portal do devedor não autoriza assinatura de credor/testemunha por delegação.
  -- Esses papéis utilizam os respectivos links individuais de assinatura.
  IF v_role <> 'DEBTOR' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este papel deve assinar pelo seu link individual.');
  END IF;
  SELECT d.snapshot ->> 'debtorName',
         d.snapshot ->> 'debtorDoc',
         d.document_version
    INTO v_expected_name, v_expected_document, v_expected_version
  FROM public.documentos_juridicos d WHERE d.id = p_documento_id;
  IF upper(btrim(coalesce(p_nome, ''))) <> upper(btrim(coalesce(v_expected_name, '')))
    OR regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g')
        <> regexp_replace(coalesce(v_expected_document, ''), '[^0-9]', '', 'g')
    OR regexp_replace(coalesce(v_expected_document, ''), '[^0-9]', '', 'g') = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Identificacao do assinante diferente do documento.');
  END IF;
  IF p_portal_token IS NOT NULL AND p_portal_token <> v_token_uuid THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token da assinatura nao confere.');
  END IF;
  IF p_document_version IS NOT NULL AND p_document_version <> v_expected_version::text THEN
    RETURN jsonb_build_object('success', false, 'message', 'Versao do documento alterada. Atualize a pagina.');
  END IF;

  -- Evitar assinaturas duplicadas para o mesmo papel no documento
  IF EXISTS (
    SELECT 1
    FROM assinaturas_documento s
    WHERE s.document_id = p_documento_id
      AND upper(COALESCE(to_jsonb(s) ->> v_role_column, '')) = v_role
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este papel ja assinou o documento');
  END IF;

  -- Resolve o token do portal da assinatura
  v_resolved_portal_token := v_token_uuid;

  -- Grava a assinatura
  EXECUTE format(
    'INSERT INTO assinaturas_documento (
      document_id, 
      %I, 
      signer_name, 
      signer_document, 
      ip_origem, 
      user_agent, 
      signed_at, 
      signer_email, 
      signer_phone, 
      hash_assinatura,
      client_timezone,
      document_version,
      portal_token
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12)',
    v_role_column
  )
  USING
    p_documento_id,
    v_role,
    p_nome,
    p_cpf,
    COALESCE(p_ip, '0.0.0.0'),
    COALESCE(p_user_agent, ''),
    p_email,
    p_phone,
    p_hash_assinado,
    p_client_timezone,
    p_document_version,
    v_resolved_portal_token;

  -- Atualiza o status do documento jurídico se a assinatura for do devedor principal
  IF v_role = 'DEBTOR' THEN
    UPDATE documentos_juridicos
    SET status_assinatura = 'ASSINADO',
        signed_at = coalesce(signed_at, now()),
        updated_at = now()
    WHERE id = p_documento_id;

    -- QUEIMA DIGITAL: Bloqueia o portal setando portal_burned_at = NOW()
    UPDATE contratos
    SET portal_burned_at = NOW()
    WHERE id = v_loan_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_sign_document(text,text,uuid,text,text,text,text,text,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(text,text,uuid,text,text,text,text,text,text,text,text,text,text,uuid) TO anon,authenticated,service_role;
-- O documento assinado fica imutável para o portador de credenciais do portal.
CREATE OR REPLACE FUNCTION public.portal_patch_document_snapshot(p_token text, p_shortcode text, p_documento_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
  v_updated_id uuid;
  v_forbidden_keys text[];
BEGIN
  IF p_documento_id IS NULL THEN
    RAISE EXCEPTION 'Documento inválido' USING ERRCODE = '22023';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Patch inválido' USING ERRCODE = '22023';
  END IF;

  v_client_id := public.portal_resolve_client_id(p_token, p_shortcode);
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Acesso inválido' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(k ORDER BY k)
  INTO v_forbidden_keys
  FROM jsonb_object_keys(p_patch) AS k
  WHERE k <> ALL (ARRAY[
    'documento','nome',
    'debtorAddress','debtorPhone','debtorDoc','debtorName',
    'clientName','client_name',
    'witness1Name','witness1Doc','witness2Name','witness2Doc',
    'avalistaNome','avalistaCpf','avalistaEndereco',
    'guarantorName','guarantorDoc','guarantorAddress',
    'status_assinatura','client_adjustment_request','client_refusal_reason'
  ]::text[]);

  IF COALESCE(array_length(v_forbidden_keys, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Campos não permitidos no portal: %', array_to_string(v_forbidden_keys, ', ')
      USING ERRCODE = '42501';
  END IF;

  -- Somente contratos do próprio portal, pendentes, não assinados e não bloqueados.
  -- O token não pode ser reutilizado em outro contrato do mesmo cliente.
  UPDATE public.documentos_juridicos d
  SET snapshot = COALESCE(d.snapshot, '{}'::jsonb) || p_patch
  WHERE d.id = p_documento_id
    AND upper(coalesce(d.status_assinatura, '')) IN ('PENDENTE','EM_ASSINATURA')
    AND d.signed_at IS NULL
    AND d.locked_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.contratos c
      WHERE c.id = d.loan_id
        AND c.client_id = v_client_id
        AND c.portal_token::text = p_token
        AND c.portal_shortcode = p_shortcode
        AND c.portal_burned_at IS NULL
        AND public.portal_status_allows_access(c.status, c.is_archived)
        AND d.profile_id = c.owner_id
    )
  RETURNING d.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Documento não encontrado para este portal' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('ok', true, 'document_id', v_updated_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_patch_document_snapshot(text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_patch_document_snapshot(text,text,uuid,jsonb) TO anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
