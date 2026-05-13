-- Consolidated Migration: Portal RPCs & Legal Engine Stability
-- Date: 2026-03-22
-- Focus: Fixes "Motor Jurídico" by ensuring snapshot_rendered_html is persisted and served.

-- 1. Ensure column exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documentos_juridicos' AND column_name = 'snapshot_rendered_html') THEN
        ALTER TABLE documentos_juridicos ADD COLUMN snapshot_rendered_html TEXT;
    END IF;
END $$;

-- 2. Drop existing functions to avoid return type mismatch
DROP FUNCTION IF EXISTS get_documento_juridico_by_view_token(text);
DROP FUNCTION IF EXISTS get_documento_juridico_by_id(uuid);
DROP FUNCTION IF EXISTS portal_list_docs(text);
DROP FUNCTION IF EXISTS portal_list_docs(text, text);
DROP FUNCTION IF EXISTS portal_get_doc(text, text, uuid);

-- 3. Function: get_documento_juridico_by_view_token
CREATE OR REPLACE FUNCTION get_documento_juridico_by_view_token(p_view_token TEXT)
RETURNS TABLE (
    id UUID,
    loan_id UUID,
    profile_id UUID,
    tipo TEXT,
    snapshot JSONB,
    snapshot_rendered_html TEXT,
    hash_sha256 TEXT,
    status_assinatura TEXT,
    view_token TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id, d.loan_id, d.profile_id, d.tipo, d.snapshot, 
        d.snapshot_rendered_html, d.hash_sha256, d.status_assinatura, 
        d.view_token, d.created_at, d.updated_at
    FROM documentos_juridicos d
    WHERE d.view_token = p_view_token;
END;
$$;

-- 4. Function: get_documento_juridico_by_id
CREATE OR REPLACE FUNCTION get_documento_juridico_by_id(p_document_id UUID)
RETURNS TABLE (
    id UUID,
    loan_id UUID,
    profile_id UUID,
    tipo TEXT,
    snapshot JSONB,
    snapshot_rendered_html TEXT,
    hash_sha256 TEXT,
    status_assinatura TEXT,
    view_token TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id, d.loan_id, d.profile_id, d.tipo, d.snapshot, 
        d.snapshot_rendered_html, d.hash_sha256, d.status_assinatura, 
        d.view_token, d.created_at, d.updated_at
    FROM documentos_juridicos d
    WHERE d.id = p_document_id;
END;
$$;

-- 5. Function: portal_list_docs
CREATE OR REPLACE FUNCTION portal_list_docs(p_token TEXT, p_shortcode TEXT)
RETURNS TABLE (
    id UUID,
    tipo TEXT,
    status_assinatura TEXT,
    snapshot_rendered_html TEXT,
    created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id, d.tipo, d.status_assinatura, d.snapshot_rendered_html, d.created_at
    FROM documentos_juridicos d
    JOIN contratos c ON d.loan_id = c.id
    WHERE c.portal_token = p_token;
END;
$$;

-- 6. Function: portal_get_doc
CREATE OR REPLACE FUNCTION portal_get_doc(p_token TEXT, p_shortcode TEXT, p_doc_id UUID)
RETURNS TABLE (
    id UUID,
    tipo TEXT,
    snapshot JSONB,
    snapshot_rendered_html TEXT,
    hash_sha256 TEXT,
    status_assinatura TEXT,
    view_token TEXT,
    created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id, d.tipo, d.snapshot, d.snapshot_rendered_html, d.hash_sha256, 
        d.status_assinatura, d.view_token, d.created_at
    FROM documentos_juridicos d
    JOIN contratos c ON d.loan_id = c.id
    WHERE c.portal_token = p_token AND d.id = p_doc_id;
END;
$$;

-- 7. Permissions
GRANT EXECUTE ON FUNCTION get_documento_juridico_by_view_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_documento_juridico_by_id(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION portal_list_docs(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION portal_get_doc(text, text, uuid) TO anon, authenticated, service_role;
