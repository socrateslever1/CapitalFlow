-- Segurança de assinatura por link individual, sem alteração retroativa de contratos ou documentos.
-- Assinatura anterior: md5(pg_get_functiondef) = f9d4eec519665ae04c8d6a164efbe169
DO $preflight$
BEGIN
  IF to_regprocedure('public.sign_documento_juridico_by_view_token(text,text,text,text,text,text,text,text,jsonb)') IS NULL
    OR md5(pg_get_functiondef('public.sign_documento_juridico_by_view_token(text,text,text,text,text,text,text,text,jsonb)'::regprocedure)) <> 'f9d4eec519665ae04c8d6a164efbe169'
    OR to_regprocedure('public.legal_document_missing_fields_v1(jsonb)') IS NULL
  THEN
    RAISE EXCEPTION 'Assinatura pública alterada: revisão manual necessária antes da migração.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.documentos_juridicos
    WHERE nullif(btrim(view_token), '') IS NOT NULL
    GROUP BY view_token HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tokens de visualização duplicados: corrigir antes da migração.';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_documentos_juridicos_view_token_v1
ON public.documentos_juridicos(view_token)
WHERE nullif(btrim(view_token),'') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.legal_normalize_signature_role_v1(p_role text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $role$
  SELECT CASE
    WHEN upper(btrim(coalesce(p_role,''))) IN ('DEVEDOR','DEBTOR') THEN 'DEBTOR'
    WHEN upper(btrim(coalesce(p_role,''))) IN ('CREDOR','CREDITOR') THEN 'CREDITOR'
    WHEN upper(btrim(coalesce(p_role,''))) IN ('AVALISTA','GUARANTOR') THEN 'AVALISTA'
    WHEN upper(btrim(coalesce(p_role,''))) IN ('TESTEMUNHA','WITNESS') THEN 'WITNESS_1'
    WHEN upper(btrim(coalesce(p_role,''))) ~ '^(WITNESS|TESTEMUNHA)_[1-9][0-9]?$'
      THEN replace(upper(btrim(p_role)),'TESTEMUNHA_','WITNESS_')
    ELSE NULL END
$role$;
REVOKE ALL ON FUNCTION public.legal_normalize_signature_role_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.legal_normalize_signature_role_v1(text) TO service_role;

CREATE OR REPLACE FUNCTION public.sign_documento_juridico_by_view_token(
  p_view_token text,
  p_papel text,
  p_nome text,
  p_cpf text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_hash_assinado text DEFAULT NULL,
  p_assinatura_imagem text DEFAULT NULL,
  p_dispositivo_info jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $sign$
DECLARE
  v_doc public.documentos_juridicos%rowtype;
  v_role text;
  v_index integer;
  v_witness jsonb;
  v_expected_name text;
  v_expected_doc text;
  v_doc_digits text;
  v_input_digits text;
  v_required_roles text[] := ARRAY[]::text[];
  v_signed_roles text[] := ARRAY[]::text[];
  v_witnesses jsonb := '[]'::jsonb;
  v_next_status text := 'EM_ASSINATURA';
  v_client_id uuid;
  i integer;
BEGIN
  IF p_view_token IS NULL OR length(btrim(p_view_token)) < 16 THEN
    RETURN jsonb_build_object('success',false,'message','Link inválido.');
  END IF;

  -- A mesma linha é travada durante leitura, assinatura e atualização do estado.
  SELECT * INTO v_doc FROM public.documentos_juridicos
  WHERE view_token = p_view_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'message','Documento não encontrado.');
  END IF;
  IF upper(coalesce(v_doc.status_assinatura,'')) NOT IN ('PENDENTE','EM_ASSINATURA')
    OR upper(coalesce(v_doc.status,'')) IN ('CANCELADO','CANCELED','CANCELLED','REJEITADO','REJECTED','SUPERSEDED')
    OR v_doc.locked_at IS NOT NULL
    OR (v_doc.token_expires_at IS NOT NULL AND v_doc.token_expires_at <= now())
  THEN
    RETURN jsonb_build_object('success',false,'message','Documento indisponível para assinatura.');
  END IF;
  IF jsonb_typeof(v_doc.snapshot) IS DISTINCT FROM 'object'
    OR jsonb_array_length(public.legal_document_missing_fields_v1(v_doc.snapshot)) <> 0
    OR coalesce(v_doc.hash_sha256,'') !~* '^[0-9a-f]{64}$'
  THEN
    RETURN jsonb_build_object('success',false,'message','Dados obrigatórios ou integridade documental pendentes.');
  END IF;
  IF v_doc.loan_id IS NOT NULL THEN
    SELECT c.client_id INTO v_client_id
    FROM public.contratos c
    WHERE c.id=v_doc.loan_id
      AND c.owner_id=v_doc.profile_id
      AND (v_doc.client_id IS NULL OR v_doc.client_id=c.client_id)
      AND public.portal_status_allows_access(c.status,c.is_archived)
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success',false,'message','Documento sem contrato válido.');
    END IF;
    IF nullif(v_doc.snapshot->>'loanId','') IS NOT NULL
      AND v_doc.snapshot->>'loanId' <> v_doc.loan_id::text
    THEN
      RETURN jsonb_build_object('success',false,'message','Documento divergente do contrato.');
    END IF;
  ELSE
    -- Não transformar rascunhos legados sem vínculo em títulos assináveis.
    IF v_doc.registration_link_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.client_registration_links r
      WHERE r.id=v_doc.registration_link_id
        AND r.profile_id=v_doc.profile_id AND r.active
        AND (r.expires_at IS NULL OR r.expires_at > now())
    ) THEN
      RETURN jsonb_build_object('success',false,'message','Documento sem vínculo válido para assinatura.');
    END IF;
  END IF;

  v_role := public.legal_normalize_signature_role_v1(p_papel);
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success',false,'message','Papel de assinatura inválido.');
  END IF;
  IF jsonb_typeof(v_doc.snapshot->'witnesses')='array' THEN
    v_witnesses := v_doc.snapshot->'witnesses';
  END IF;
  IF CASE WHEN jsonb_typeof(v_doc.snapshot->'requiredSignatureRoles')='array'
      THEN jsonb_array_length(v_doc.snapshot->'requiredSignatureRoles')>0
      ELSE false END
  THEN
    SELECT coalesce(array_agg(DISTINCT public.legal_normalize_signature_role_v1(role_value)),ARRAY[]::text[])
    INTO v_required_roles
    FROM jsonb_array_elements_text(v_doc.snapshot->'requiredSignatureRoles') AS required(role_value);
    IF array_position(v_required_roles,NULL) IS NOT NULL THEN
      RETURN jsonb_build_object('success',false,'message','Papéis previstos no documento são inválidos.');
    END IF;
  ELSE
    IF nullif(btrim(v_doc.snapshot->>'debtorName'),'') IS NOT NULL THEN
      v_required_roles := array_append(v_required_roles,'DEBTOR');
    END IF;
    IF nullif(btrim(v_doc.snapshot->>'creditorName'),'') IS NOT NULL THEN
      v_required_roles := array_append(v_required_roles,'CREDITOR');
    END IF;
    FOR i IN 1..jsonb_array_length(v_witnesses) LOOP
      v_required_roles := array_append(v_required_roles,'WITNESS_'||i);
    END LOOP;
    IF coalesce(v_doc.snapshot->>'incluirAvalista','false')='true'
      AND nullif(btrim(v_doc.snapshot->>'avalistaNome'),'') IS NOT NULL
    THEN
      v_required_roles := array_append(v_required_roles,'AVALISTA');
    END IF;
  END IF;
  IF cardinality(v_required_roles)=0 OR NOT (v_role=ANY(v_required_roles)) THEN
    RETURN jsonb_build_object('success',false,'message','Papel não autorizado para este documento.');
  END IF;

  IF v_role='DEBTOR' THEN
    v_expected_name := v_doc.snapshot->>'debtorName';
    v_expected_doc := v_doc.snapshot->>'debtorDoc';
  ELSIF v_role='CREDITOR' THEN
    v_expected_name := v_doc.snapshot->>'creditorName';
    v_expected_doc := v_doc.snapshot->>'creditorDoc';
  ELSIF v_role='AVALISTA' THEN
    v_expected_name := coalesce(v_doc.snapshot->>'avalistaNome',v_doc.snapshot->>'guarantorName');
    v_expected_doc := coalesce(v_doc.snapshot->>'avalistaCpf',v_doc.snapshot->>'guarantorDoc');
  ELSE
    v_index := split_part(v_role,'_',2)::integer;
    IF v_index < 1 OR v_index > jsonb_array_length(v_witnesses) THEN
      RETURN jsonb_build_object('success',false,'message','Testemunha não prevista no documento.');
    END IF;
    v_witness := v_witnesses->(v_index-1);
    v_expected_name := v_witness->>'name';
    v_expected_doc := coalesce(v_witness->>'document',v_doc.snapshot->>('witness'||v_index||'Doc'));
  END IF;

  v_doc_digits := regexp_replace(coalesce(v_expected_doc,''),'[^0-9]','','g');
  v_input_digits := regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
  IF nullif(btrim(v_expected_name),'') IS NULL OR length(v_doc_digits) NOT IN (11,14)
    OR v_doc_digits<>v_input_digits
    OR upper(btrim(v_expected_name)) <> upper(btrim(coalesce(p_nome,'')))
  THEN
    RETURN jsonb_build_object('success',false,'message','Identificação não corresponde ao assinante previsto.');
  END IF;
  IF coalesce(p_hash_assinado,'') !~* '^[0-9a-f]{64}$'
    OR coalesce(length(p_assinatura_imagem),0)>3000000
    OR jsonb_typeof(coalesce(p_dispositivo_info,'{}'::jsonb))<>'object'
    OR length(coalesce(p_dispositivo_info,'{}'::jsonb)::text)>32768
  THEN
    RETURN jsonb_build_object('success',false,'message','Dados da assinatura inválidos.');
  END IF;

  SELECT coalesce(array_agg(DISTINCT public.legal_normalize_signature_role_v1(coalesce(s.papel,s.role))),ARRAY[]::text[])
  INTO v_signed_roles
  FROM public.assinaturas_documento s
  WHERE s.document_id=v_doc.id;
  IF v_role=ANY(v_signed_roles) THEN
    RETURN jsonb_build_object('success',false,'message','Este papel já assinou o documento.');
  END IF;

  INSERT INTO public.assinaturas_documento (
    document_id,profile_id,nome,cpf,aceitou,ip,signer_name,signer_document,
    role,papel,assinatura_hash,hash_assinado,hash_assinatura,ip_origem,
    user_agent,signed_at,assinatura_imagem,dispositivo_info
  ) VALUES (
    v_doc.id,v_doc.profile_id,upper(btrim(p_nome)),v_input_digits,true,
    coalesce(p_ip,'0.0.0.0'),upper(btrim(p_nome)),v_input_digits,
    v_role,v_role,p_hash_assinado,p_hash_assinado,p_hash_assinado,
    coalesce(p_ip,'0.0.0.0'),coalesce(p_user_agent,''),now(),p_assinatura_imagem,
    coalesce(p_dispositivo_info,'{}'::jsonb)
  );

  v_signed_roles := array_append(v_signed_roles,v_role);
  IF cardinality(v_required_roles)>0
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_required_roles) AS roles(required_role)
      WHERE NOT (required_role=ANY(v_signed_roles))
    )
  THEN
    v_next_status:='ASSINADO';
  END IF;

  UPDATE public.documentos_juridicos
  SET status_assinatura=v_next_status,
      signed_at=CASE WHEN v_next_status='ASSINADO' THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_doc.id AND status_assinatura IN ('PENDENTE','EM_ASSINATURA');

  RETURN jsonb_build_object('success',true,'status',v_next_status);
END;
$sign$;
REVOKE ALL ON FUNCTION public.sign_documento_juridico_by_view_token(text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sign_documento_juridico_by_view_token(text,text,text,text,text,text,text,text,jsonb) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
