
-- CONSOLIDADO DE RPCS PARA MOTOR JURÍDICO E ASSINATURAS
-- Garante que os links de assinatura funcionem com tokens de visualização

-- 1. Função para buscar documento por token (USADA PELA PÁGINA PÚBLICA)
DROP FUNCTION IF EXISTS get_documento_juridico_by_view_token(text);
CREATE OR REPLACE FUNCTION get_documento_juridico_by_view_token(p_view_token TEXT)
RETURNS SETOF documentos_juridicos
LANGUAGE plpgsql
SECURITY DEFINER -- PERMITE ACESSO PÚBLICO CONTROLADO
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM documentos_juridicos
    WHERE view_token = p_view_token
    LIMIT 1;
END;
$$;

-- 2. Função para criar/registrar documento (Garante unicidade e status inicial)
DROP FUNCTION IF EXISTS create_documento_juridico_by_loan(uuid, text, jsonb, uuid, uuid);
CREATE OR REPLACE FUNCTION create_documento_juridico_by_loan(
    p_loan_id UUID,
    p_tipo TEXT,
    p_snapshot JSONB,
    p_acordo_id UUID DEFAULT NULL,
    p_dono_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    hash_sha256 TEXT,
    view_token TEXT,
    status_assinatura TEXT,
    created_at TIMESTAMPTZ,
    acordo_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
    v_token TEXT;
    v_hash TEXT;
BEGIN
    -- Gera token único de visualização se não existir
    v_token := encode(gen_random_bytes(32), 'hex');
    v_hash := encode(digest(p_snapshot::text, 'sha256'), 'hex');

    INSERT INTO documentos_juridicos (
        loan_id,
        tipo,
        snapshot,
        acordo_id,
        profile_id,
        hash_sha256,
        view_token,
        status_assinatura
    ) VALUES (
        p_loan_id,
        p_tipo,
        p_snapshot,
        p_acordo_id,
        p_dono_id,
        v_hash,
        v_token,
        'PENDENTE'
    )
    RETURNING documentos_juridicos.id INTO v_id;

    RETURN QUERY
    SELECT 
        d.id, 
        d.hash_sha256, 
        d.view_token, 
        d.status_assinatura, 
        d.created_at,
        d.acordo_id
    FROM documentos_juridicos d
    WHERE d.id = v_id;
END;
$$;

-- 3. Função para buscar por ID (ADMIN)
DROP FUNCTION IF EXISTS get_documento_juridico_by_id(uuid);
CREATE OR REPLACE FUNCTION get_documento_juridico_by_id(p_document_id UUID)
RETURNS SETOF documentos_juridicos
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM documentos_juridicos
    WHERE id = p_document_id
    LIMIT 1;
END;
$$;

-- Garantir que as tabelas de assinaturas tenham as colunas corretas
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assinaturas_documento' AND column_name = 'papel') THEN
        ALTER TABLE assinaturas_documento ADD COLUMN papel TEXT;
    END IF;
END $$;
