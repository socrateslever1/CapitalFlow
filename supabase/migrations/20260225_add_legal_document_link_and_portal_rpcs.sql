
-- Migration: 20260225_add_legal_document_link_and_portal_rpcs.sql

-- 1. Adiciona coluna para vincular acordo ao documento jurídico
ALTER TABLE acordos_inadimplencia 
ADD COLUMN IF NOT EXISTS legal_document_id UUID REFERENCES documentos_juridicos(id);

-- 2. Função para listar documentos no portal do cliente
CREATE OR REPLACE FUNCTION portal_list_docs(p_token TEXT)
RETURNS TABLE (
    id UUID,
    tipo_documento TEXT,
    status_assinatura TEXT,
    created_at TIMESTAMPTZ,
    hash_sha256 TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_client_id UUID;
BEGIN
    -- Busca o cliente pelo token do portal
    SELECT client_id INTO v_client_id FROM portal_tokens WHERE token = p_token AND expires_at > NOW();
    
    IF v_client_id IS NULL THEN
        RETURN;
    END IF;

    -- Retorna documentos vinculados aos empréstimos do cliente
    RETURN QUERY
    SELECT 
        d.id,
        d.tipo_documento,
        d.status_assinatura,
        d.created_at,
        d.hash_sha256
    FROM documentos_juridicos d
    JOIN loans l ON d.loan_id = l.id
    WHERE l.client_id = v_client_id
    ORDER BY d.created_at DESC;
END;
$$;

-- 3. Função para buscar um documento específico no portal
CREATE OR REPLACE FUNCTION portal_get_doc(p_token TEXT, p_doc_id UUID)
RETURNS TABLE (
    id UUID,
    tipo_documento TEXT,
    status_assinatura TEXT,
    snapshot JSONB,
    view_token TEXT,
    hash_sha256 TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_client_id UUID;
BEGIN
    SELECT client_id INTO v_client_id FROM portal_tokens WHERE token = p_token AND expires_at > NOW();
    
    IF v_client_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        d.id,
        d.tipo_documento,
        d.status_assinatura,
        d.snapshot,
        d.view_token,
        d.hash_sha256
    FROM documentos_juridicos d
    JOIN loans l ON d.loan_id = l.id
    WHERE l.client_id = v_client_id AND d.id = p_doc_id;
END;
$$;

-- 4. Função para assinar documento via portal
CREATE OR REPLACE FUNCTION portal_sign_document(
    p_token TEXT,
    p_doc_id UUID,
    p_role TEXT,
    p_name TEXT,
    p_cpf TEXT,
    p_ip TEXT,
    p_user_agent TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_client_id UUID;
    v_loan_id UUID;
BEGIN
    -- Valida token
    SELECT client_id INTO v_client_id FROM portal_tokens WHERE token = p_token AND expires_at > NOW();
    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Token inválido ou expirado');
    END IF;

    -- Valida se o documento pertence ao cliente
    SELECT loan_id INTO v_loan_id 
    FROM documentos_juridicos d
    JOIN loans l ON d.loan_id = l.id
    WHERE l.client_id = v_client_id AND d.id = p_doc_id;

    IF v_loan_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Documento não encontrado');
    END IF;

    -- Registra a assinatura
    INSERT INTO assinaturas_documento (
        document_id,
        role,
        signer_name,
        signer_document,
        ip_origem,
        user_agent,
        signed_at
    ) VALUES (
        p_doc_id,
        p_role,
        p_name,
        p_cpf,
        p_ip,
        p_user_agent,
        NOW()
    );

    -- Atualiza status do documento se necessário (ex: se for o devedor principal)
    IF p_role = 'DEVEDOR' THEN
        UPDATE documentos_juridicos 
        SET status_assinatura = 'ASSINADO' 
        WHERE id = p_doc_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;
