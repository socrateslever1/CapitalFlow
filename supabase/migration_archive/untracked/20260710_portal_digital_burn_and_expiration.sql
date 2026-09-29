-- Migration: 20260710_portal_digital_burn_and_expiration.sql
-- Descrição: Implementa queima digital, validade e limite de visualizações para o portal de clientes devedores.

-- 1. Adicionar colunas de controle na tabela contratos
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS portal_view_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS portal_view_limit INTEGER DEFAULT 5 NOT NULL,
  ADD COLUMN IF NOT EXISTS portal_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_burned_at TIMESTAMPTZ;

-- Define validade retroativa de 72h para contratos antigos com tokens ativos
UPDATE public.contratos
SET portal_expires_at = created_at + INTERVAL '72 hours'
WHERE portal_token IS NOT NULL AND portal_expires_at IS NULL;

-- 2. Recriar função de validação de acesso validate_portal_access
CREATE OR REPLACE FUNCTION public.validate_portal_access(p_token text, p_shortcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL OR COALESCE(trim(p_shortcode), '') = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM contratos
    WHERE portal_token = v_token_uuid
      AND portal_shortcode = p_shortcode
      AND public.portal_status_allows_access(status, is_archived)
      -- Verificações de Expiração e Queima Digital:
      AND portal_burned_at IS NULL
      AND (portal_expires_at IS NULL OR portal_expires_at > now())
      AND (COALESCE(portal_view_count, 0) < COALESCE(portal_view_limit, 5))
  );
END;
$$;

-- 3. Recriar função de visualização portal_mark_viewed para incrementar acessos
CREATE OR REPLACE FUNCTION public.portal_mark_viewed(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF public.validate_portal_access(p_token, p_shortcode) THEN
    -- Incrementa visualizações
    UPDATE public.contratos
    SET portal_view_count = portal_view_count + 1
    WHERE portal_token = v_token_uuid
      AND portal_shortcode = p_shortcode;

    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false);
END;
$$;

-- 4. Atualizar a RPC portal_sign_document para queimar o token pós-assinatura do devedor principal
CREATE OR REPLACE FUNCTION public.portal_sign_document(
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
  p_hash_assinado text DEFAULT NULL,
  p_client_timezone text DEFAULT NULL,
  p_document_version text DEFAULT NULL,
  p_portal_token uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_client_id uuid;
  v_loan_id uuid;
  v_role_column text;
  v_role text;
  v_resolved_portal_token uuid;
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
  v_resolved_portal_token := COALESCE(p_portal_token, v_token_uuid);

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
    SET status_assinatura = 'ASSINADO'
    WHERE id = p_documento_id;

    -- QUEIMA DIGITAL: Bloqueia o portal setando portal_burned_at = NOW()
    UPDATE contratos
    SET portal_burned_at = NOW()
    WHERE id = v_loan_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_sign_document(text, text, uuid, text, text, text, text, text, text, text, text, text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_portal_access(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_mark_viewed(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
