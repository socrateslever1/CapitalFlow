SET search_path = public;

DROP FUNCTION IF EXISTS validate_portal_access(text, text);
DROP FUNCTION IF EXISTS portal_mark_viewed(text, text);
DROP FUNCTION IF EXISTS portal_get_client(text, text);
DROP FUNCTION IF EXISTS portal_list_contracts(text, text);
DROP FUNCTION IF EXISTS portal_get_full_loan(text, text);
DROP FUNCTION IF EXISTS portal_get_parcels(text, text);
DROP FUNCTION IF EXISTS portal_get_signals(text, text);
DROP FUNCTION IF EXISTS portal_list_docs(text, text);
DROP FUNCTION IF EXISTS portal_get_doc(text, text, uuid);
DROP FUNCTION IF EXISTS portal_sign_document(text, text, uuid, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS portal_registrar_intencao(text, text, text, text);
DROP FUNCTION IF EXISTS rpc_doc_missing_fields(uuid);
DROP FUNCTION IF EXISTS rpc_doc_patch_snapshot(uuid, jsonb);

CREATE OR REPLACE FUNCTION validate_portal_access(p_token text, p_shortcode text)
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
      AND COALESCE(is_archived, false) = false
      AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  );
END;
$$;

CREATE OR REPLACE FUNCTION portal_mark_viewed(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF validate_portal_access(p_token, p_shortcode) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false);
END;
$$;

CREATE OR REPLACE FUNCTION portal_get_client(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_client jsonb;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT row_to_json(c)::jsonb
  INTO v_client
  FROM clientes c
  JOIN contratos l ON l.client_id = c.id
  WHERE l.portal_token = v_token_uuid
    AND l.portal_shortcode = p_shortcode
    AND COALESCE(l.is_archived, false) = false
    AND l.status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  RETURN v_client;
END;
$$;

CREATE OR REPLACE FUNCTION portal_list_contracts(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_client_id uuid;
  v_contracts jsonb;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT client_id
  INTO v_client_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(contract_payload ORDER BY next_due_date NULLS LAST, created_at DESC),
    '[]'::jsonb
  )
  INTO v_contracts
  FROM (
    SELECT
      to_jsonb(l)
      || jsonb_build_object(
        'installments', COALESCE(inst.installments, '[]'::jsonb),
        'payment_intents', COALESCE(signals.payment_intents, '[]'::jsonb),
        'paymentSignals', COALESCE(signals.payment_intents, '[]'::jsonb),
        'transacoes', COALESCE(tx.transacoes, '[]'::jsonb),
        'ledger', COALESCE(tx.transacoes, '[]'::jsonb),
        'acordo_ativo', agreement.acordo_ativo,
        'parcelas_acordo', COALESCE(agreement.parcelas_acordo, '[]'::jsonb)
      ) AS contract_payload,
      due.next_due_date,
      l.created_at
    FROM contratos l
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(p) ORDER BY COALESCE(p.data_vencimento, p.due_date), p.numero_parcela),
        '[]'::jsonb
      ) AS installments
      FROM parcelas p
      WHERE p.loan_id = l.id
    ) inst ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.date DESC),
        '[]'::jsonb
      ) AS transacoes
      FROM transacoes t
      WHERE t.loan_id = l.id
    ) tx ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC),
        '[]'::jsonb
      ) AS payment_intents
      FROM payment_intents i
      WHERE i.loan_id = l.id
    ) signals ON true
    LEFT JOIN LATERAL (
      SELECT
        to_jsonb(a) AS acordo_ativo,
        COALESCE((
          SELECT jsonb_agg(
            to_jsonb(ap)
            ORDER BY COALESCE(ap.data_vencimento, ap.due_date), ap.numero
          )
          FROM acordo_parcelas ap
          WHERE ap.acordo_id = a.id
        ), '[]'::jsonb) AS parcelas_acordo
      FROM acordos_inadimplencia a
      WHERE a.loan_id = l.id
        AND (
          a.id = l.acordo_ativo_id
          OR upper(COALESCE(a.status, '')) IN ('ATIVO', 'ACTIVE')
        )
      ORDER BY CASE WHEN a.id = l.acordo_ativo_id THEN 0 ELSE 1 END, a.created_at DESC
      LIMIT 1
    ) agreement ON true
    LEFT JOIN LATERAL (
      SELECT MIN(COALESCE(p.data_vencimento, p.due_date)) AS next_due_date
      FROM parcelas p
      WHERE p.loan_id = l.id
        AND upper(COALESCE(p.status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO')
    ) due ON true
    WHERE l.client_id = v_client_id
      AND l.portal_token IS NOT NULL
      AND COALESCE(l.is_archived, false) = false
      AND l.status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  ) contracts_view;

  RETURN v_contracts;
END;
$$;

CREATE OR REPLACE FUNCTION portal_get_full_loan(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_loan_id uuid;
  v_payload jsonb;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_loan_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  IF v_loan_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    to_jsonb(l)
    || jsonb_build_object(
      'installments', COALESCE(inst.installments, '[]'::jsonb),
      'payment_intents', COALESCE(signals.payment_intents, '[]'::jsonb),
      'paymentSignals', COALESCE(signals.payment_intents, '[]'::jsonb),
      'transacoes', COALESCE(tx.transacoes, '[]'::jsonb),
      'ledger', COALESCE(tx.transacoes, '[]'::jsonb),
      'acordo_ativo', agreement.acordo_ativo,
      'parcelas_acordo', COALESCE(agreement.parcelas_acordo, '[]'::jsonb)
    )
  INTO v_payload
  FROM contratos l
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(p) ORDER BY COALESCE(p.data_vencimento, p.due_date), p.numero_parcela),
      '[]'::jsonb
    ) AS installments
    FROM parcelas p
    WHERE p.loan_id = l.id
  ) inst ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(t) ORDER BY t.date DESC),
      '[]'::jsonb
    ) AS transacoes
    FROM transacoes t
    WHERE t.loan_id = l.id
  ) tx ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC),
      '[]'::jsonb
    ) AS payment_intents
    FROM payment_intents i
    WHERE i.loan_id = l.id
  ) signals ON true
  LEFT JOIN LATERAL (
    SELECT
      to_jsonb(a) AS acordo_ativo,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(ap)
          ORDER BY COALESCE(ap.data_vencimento, ap.due_date), ap.numero
        )
        FROM acordo_parcelas ap
        WHERE ap.acordo_id = a.id
      ), '[]'::jsonb) AS parcelas_acordo
    FROM acordos_inadimplencia a
    WHERE a.loan_id = l.id
      AND (
        a.id = l.acordo_ativo_id
        OR upper(COALESCE(a.status, '')) IN ('ATIVO', 'ACTIVE')
      )
    ORDER BY CASE WHEN a.id = l.acordo_ativo_id THEN 0 ELSE 1 END, a.created_at DESC
    LIMIT 1
  ) agreement ON true
  WHERE l.id = v_loan_id;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION portal_get_parcels(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_loan_id uuid;
  v_payload jsonb;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT id
  INTO v_loan_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  IF v_loan_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(p) ORDER BY COALESCE(p.data_vencimento, p.due_date), p.numero_parcela),
    '[]'::jsonb
  )
  INTO v_payload
  FROM parcelas p
  WHERE p.loan_id = v_loan_id;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION portal_get_signals(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_loan_id uuid;
  v_payload jsonb;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT id
  INTO v_loan_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  IF v_loan_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC),
    '[]'::jsonb
  )
  INTO v_payload
  FROM payment_intents i
  WHERE i.loan_id = v_loan_id;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION portal_list_docs(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_client_id uuid;
  v_payload jsonb;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT client_id
  INTO v_client_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC),
    '[]'::jsonb
  )
  INTO v_payload
  FROM documentos_juridicos d
  JOIN contratos l ON l.id::text = d.loan_id::text
  WHERE l.client_id = v_client_id;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION portal_get_doc(p_token text, p_shortcode text, p_doc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_uuid uuid;
  v_client_id uuid;
  v_payload jsonb;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT client_id
  INTO v_client_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(d)
  INTO v_payload
  FROM documentos_juridicos d
  JOIN contratos l ON l.id::text = d.loan_id::text
  WHERE l.client_id = v_client_id
    AND d.id = p_doc_id
  LIMIT 1;

  RETURN v_payload;
END;
$$;

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
  v_token_uuid uuid;
  v_client_id uuid;
  v_loan_id uuid;
  v_role_column text;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso inválido');
  END IF;

  SELECT client_id
  INTO v_client_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso inválido');
  END IF;

  SELECT d.loan_id
  INTO v_loan_id
  FROM documentos_juridicos d
  JOIN contratos l ON l.id::text = d.loan_id::text
  WHERE l.client_id = v_client_id
    AND d.id = p_documento_id
  LIMIT 1;

  IF v_loan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Documento não encontrado');
  END IF;

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

  IF EXISTS (
    SELECT 1
    FROM assinaturas_documento s
    WHERE s.document_id = p_documento_id
      AND upper(COALESCE(to_jsonb(s) ->> v_role_column, '')) = upper(COALESCE(p_papel, ''))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este papel já assinou o documento');
  END IF;

  EXECUTE format(
    'INSERT INTO assinaturas_documento (document_id, %I, signer_name, signer_document, ip_origem, user_agent, signed_at, signer_email, signer_phone, hash_assinatura)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)',
    v_role_column
  )
  USING
    p_documento_id,
    p_papel,
    p_nome,
    p_cpf,
    COALESCE(p_ip, '0.0.0.0'),
    COALESCE(p_user_agent, ''),
    p_email,
    p_phone,
    p_hash_assinado;

  IF upper(COALESCE(p_papel, '')) IN ('DEVEDOR', 'DEBTOR') THEN
    UPDATE documentos_juridicos
    SET status_assinatura = 'ASSINADO'
    WHERE id = p_documento_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

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
  v_token_uuid uuid;
  v_loan_id uuid;
  v_client_id uuid;
  v_profile_id uuid;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso inválido');
  END IF;

  SELECT id, client_id, COALESCE(profile_id, owner_id)
  INTO v_loan_id, v_client_id, v_profile_id
  FROM contratos
  WHERE portal_token = v_token_uuid
    AND portal_shortcode = p_shortcode
    AND COALESCE(is_archived, false) = false
    AND status IN ('ATIVO', 'RENEGOCIADO', 'EM_ACORDO', 'PENDING', 'PENDENTE')
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

CREATE OR REPLACE FUNCTION rpc_doc_missing_fields(p_documento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object('missing', '[]'::jsonb, 'can_sign', true);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_doc_patch_snapshot(p_documento_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE documentos_juridicos
  SET snapshot = COALESCE(snapshot, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb)
  WHERE id = p_documento_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_portal_access(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_mark_viewed(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_client(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_list_contracts(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_full_loan(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_parcels(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_signals(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_list_docs(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_get_doc(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_sign_document(text, text, uuid, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_registrar_intencao(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_doc_missing_fields(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_doc_patch_snapshot(uuid, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
