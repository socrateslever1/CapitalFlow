-- Fix portal_sign_document to use 'papel' instead of 'role'
CREATE OR REPLACE FUNCTION portal_sign_document(
    p_token TEXT,
    p_shortcode TEXT,
    p_documento_id UUID,
    p_papel TEXT,
    p_nome TEXT,
    p_cpf TEXT,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_ip TEXT DEFAULT '0.0.0.0',
    p_user_agent TEXT DEFAULT '',
    p_hash_assinado TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_client_id UUID;
    v_loan_id UUID;
BEGIN
    -- Valida token
    RAISE NOTICE 'DEBUG: portal_sign_document p_token: %, p_shortcode: %', p_token, p_shortcode;
    SELECT client_id INTO v_client_id FROM contratos 
    WHERE portal_token = p_token::uuid 
      AND portal_shortcode = p_shortcode
      AND status IN ('ATIVO', 'RENEGOCIADO')
    LIMIT 1;
    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Token inválido ou expirado');
    END IF;

    -- Valida se o documento pertence ao cliente
    SELECT loan_id INTO v_loan_id 
    FROM documentos_juridicos d
    JOIN contratos l ON d.loan_id = l.id
    WHERE l.client_id = v_client_id AND d.id = p_documento_id;

    IF v_loan_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Documento não encontrado');
    END IF;

    -- Registra a assinatura
    INSERT INTO assinaturas_documento (
        document_id,
        papel,
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

    -- Atualiza status do documento se necessário (ex: se for o devedor principal)
    IF p_papel IN ('DEVEDOR', 'DEBTOR') THEN
        UPDATE documentos_juridicos 
        SET status_assinatura = 'ASSINADO' 
        WHERE id = p_documento_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;
