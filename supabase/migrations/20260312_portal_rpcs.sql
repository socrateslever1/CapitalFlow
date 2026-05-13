-- Migration Final do Portal do Cliente - CapitalFlow
-- Tabelas: contratos, clientes, parcelas, transacoes, payment_intents, documentos_juridicos, assinaturas_documento

SET search_path = public;

-- 1. validate_portal_access
CREATE OR REPLACE FUNCTION validate_portal_access(p_token text, p_shortcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM contratos
    WHERE portal_token = p_token::uuid
      AND portal_shortcode = p_shortcode
      AND status IN ('ATIVO', 'RENEGOCIADO')
  );
END;
$$;

-- 2. portal_get_client
CREATE OR REPLACE FUNCTION portal_get_client(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client jsonb;
BEGIN
  SELECT row_to_json(c)::jsonb INTO v_client
  FROM clientes c
  JOIN contratos l ON l.client_id = c.id
  WHERE l.portal_token = p_token::uuid
    AND l.portal_shortcode = p_shortcode
    AND l.status IN ('ATIVO', 'RENEGOCIADO')
  LIMIT 1;

  RETURN v_client;
END;
$$;

-- 3. portal_list_contracts
CREATE OR REPLACE FUNCTION portal_list_contracts(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_contracts jsonb;
BEGIN
  -- Pega o client_id do contrato que tem esse token
  SELECT client_id INTO v_client_id
  FROM contratos
  WHERE portal_token = p_token::uuid
    AND portal_shortcode = p_shortcode
    AND status IN ('ATIVO', 'RENEGOCIADO')
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Lista contratos do mesmo cliente (escondendo QUITADO e sem token)
  SELECT jsonb_agg(row_to_json(l)) INTO v_contracts
  FROM contratos l
  WHERE client_id = v_client_id
    AND portal_token IS NOT NULL
    AND status IN ('ATIVO', 'RENEGOCIADO');

  RETURN COALESCE(v_contracts, '[]'::jsonb);
END;
$$;

-- 4. portal_get_full_loan
CREATE OR REPLACE FUNCTION portal_get_full_loan(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan_id uuid;
  v_loan jsonb;
  v_parcels jsonb;
  v_txs jsonb;
  v_intents jsonb;
BEGIN
  SELECT id INTO v_loan_id
  FROM contratos
  WHERE portal_token = p_token::uuid
    AND portal_shortcode = p_shortcode
    AND status IN ('ATIVO', 'RENEGOCIADO')
  LIMIT 1;

  IF v_loan_id IS NULL THEN RETURN NULL; END IF;

  SELECT row_to_json(l)::jsonb INTO v_loan FROM contratos l WHERE id = v_loan_id;
  SELECT jsonb_agg(row_to_json(p)) INTO v_parcels FROM parcelas p WHERE loan_id = v_loan_id;
  SELECT jsonb_agg(row_to_json(t)) INTO v_txs FROM transacoes t WHERE loan_id = v_loan_id;
  SELECT jsonb_agg(row_to_json(i)) INTO v_intents FROM payment_intents i WHERE loan_id = v_loan_id;

  RETURN v_loan || jsonb_build_object(
    'installments', COALESCE(v_parcels, '[]'::jsonb),
    'transactions', COALESCE(v_txs, '[]'::jsonb),
    'payment_intents', COALESCE(v_intents, '[]'::jsonb)
  );
END;
$$;

-- 5. portal_get_parcels
CREATE OR REPLACE FUNCTION portal_get_parcels(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan_id uuid;
  v_parcels jsonb;
BEGIN
  SELECT id INTO v_loan_id
  FROM contratos
  WHERE portal_token = p_token::uuid
    AND portal_shortcode = p_shortcode
    AND status IN ('ATIVO', 'RENEGOCIADO')
  LIMIT 1;

  IF v_loan_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT jsonb_agg(row_to_json(p)) INTO v_parcels
  FROM parcelas p
  WHERE loan_id = v_loan_id
  ORDER BY COALESCE(data_vencimento, due_date) ASC;

  RETURN COALESCE(v_parcels, '[]'::jsonb);
END;
$$;

-- 6. portal_get_signals
CREATE OR REPLACE FUNCTION portal_get_signals(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan_id uuid;
  v_signals jsonb;
BEGIN
  SELECT id INTO v_loan_id
  FROM contratos
  WHERE portal_token = p_token::uuid
    AND portal_shortcode = p_shortcode
    AND status IN ('ATIVO', 'RENEGOCIADO')
  LIMIT 1;

  IF v_loan_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  -- Usar payment_intents como sinais
  SELECT jsonb_agg(row_to_json(i)) INTO v_signals
  FROM payment_intents i
  WHERE loan_id = v_loan_id;

  RETURN COALESCE(v_signals, '[]'::jsonb);
END;
$$;

-- 7. portal_list_docs
CREATE OR REPLACE FUNCTION portal_list_docs(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_docs jsonb;
BEGIN
  SELECT client_id INTO v_client_id
  FROM contratos
  WHERE portal_token = p_token::uuid
    AND portal_shortcode = p_shortcode
    AND status IN ('ATIVO', 'RENEGOCIADO')
  LIMIT 1;

  IF v_client_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT jsonb_agg(row_to_json(d)) INTO v_docs
  FROM documentos_juridicos d
  JOIN contratos l ON d.loan_id = l.id
  WHERE l.client_id = v_client_id;

  RETURN COALESCE(v_docs, '[]'::jsonb);
END;
$$;

-- 8. portal_get_doc
CREATE OR REPLACE FUNCTION portal_get_doc(p_token text, p_shortcode text, p_doc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_doc jsonb;
BEGIN
  SELECT client_id INTO v_client_id
  FROM contratos
  WHERE portal_token = p_token::uuid
    AND portal_shortcode = p_shortcode
    AND status IN ('ATIVO', 'RENEGOCIADO')
  LIMIT 1;

  IF v_client_id IS NULL THEN RETURN NULL; END IF;

  SELECT row_to_json(d)::jsonb INTO v_doc
  FROM documentos_juridicos d
  JOIN contratos l ON d.loan_id = l.id
  WHERE l.client_id = v_client_id AND d.id = p_doc_id;

  RETURN v_doc;
END;
$$;

-- 9. portal_sign_document
CREATE OR REPLACE FUNCTION portal_sign_document(
    p_token text,
    p_shortcode text,
    p_documento_id uuid,
    p_papel text,
    p_nome text,
    p_cpf text,
    p_email text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_ip text DEFAULT '0.0.0.0',
    p_user_agent text DEFAULT '',
    p_hash_assinado text DEFAULT NULL
) RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_client_id uuid;
    v_loan_id uuid;
BEGIN
    SELECT client_id INTO v_client_id 
    FROM contratos 
    WHERE portal_token = p_token::uuid 
      AND portal_shortcode = p_shortcode
      AND status IN ('ATIVO', 'RENEGOCIADO')
    LIMIT 1;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Acesso inválido');
    END IF;

    SELECT loan_id INTO v_loan_id 
    FROM documentos_juridicos d
    JOIN contratos l ON d.loan_id = l.id
    WHERE l.client_id = v_client_id AND d.id = p_documento_id;

    IF v_loan_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Documento não encontrado');
    END IF;

    INSERT INTO assinaturas_documento (
        document_id,
        role,
        signer_name,
        signer_document,
        ip_origem,
        user_agent,
        signed_at,
        signer_email,
        signer_phone,
        hash_assinatura
    ) VALUES (
        p_documento_id,
        p_papel,
        p_nome,
        p_cpf,
        p_ip,
        p_user_agent,
        NOW(),
        p_email,
        p_phone,
        p_hash_assinado
    );

    IF p_papel = 'DEVEDOR' THEN
        UPDATE documentos_juridicos 
        SET status_assinatura = 'ASSINADO' 
        WHERE id = p_documento_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 10. portal_registrar_intencao
CREATE OR REPLACE FUNCTION portal_registrar_intencao(
    p_token text,
    p_shortcode text,
    p_tipo text,
    p_comprovante_url text DEFAULT NULL
) RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_loan_id uuid;
    v_client_id uuid;
    v_profile_id uuid;
BEGIN
    SELECT id, client_id, profile_id INTO v_loan_id, v_client_id, v_profile_id
    FROM contratos
    WHERE portal_token = p_token::uuid
      AND portal_shortcode = p_shortcode
      AND status IN ('ATIVO', 'RENEGOCIADO')
    LIMIT 1;

    IF v_loan_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Acesso inválido');
    END IF;

    INSERT INTO payment_intents (
        client_id,
        loan_id,
        profile_id,
        method,
        status,
        comprovante_url,
        created_at
    ) VALUES (
        v_client_id,
        v_loan_id,
        v_profile_id,
        p_tipo,
        'PENDENTE',
        p_comprovante_url,
        NOW()
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 11. rpc_doc_missing_fields
CREATE OR REPLACE FUNCTION rpc_doc_missing_fields(p_documento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object('missing', '[]'::jsonb, 'can_sign', true);
END;
$$;

-- 11. rpc_doc_patch_snapshot
CREATE OR REPLACE FUNCTION rpc_doc_patch_snapshot(p_documento_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE documentos_juridicos
  SET snapshot = COALESCE(snapshot, '{}'::jsonb) || p_patch
  WHERE id = p_documento_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- GRANTS
GRANT EXECUTE ON FUNCTION validate_portal_access(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_client(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_list_contracts(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_full_loan(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_parcels(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_signals(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_registrar_intencao(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_list_docs(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_doc(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_sign_document(text, text, uuid, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_doc_missing_fields(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_doc_patch_snapshot(uuid, jsonb) TO anon, authenticated;
