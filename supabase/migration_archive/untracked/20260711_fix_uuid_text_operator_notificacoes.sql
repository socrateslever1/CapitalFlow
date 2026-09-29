-- Migration: 20260711_fix_uuid_text_operator_notificacoes.sql
-- Descrição: Corrige comparação inválida de tipos (uuid = text) nas triggers de notificações do portal.

SET search_path = public;

-- 1. Recriar trigger function notify_payment_intent_operator
CREATE OR REPLACE FUNCTION notify_payment_intent_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_client_name text;
  v_status text;
  v_title text;
  v_message text;
  v_payload jsonb;
BEGIN
  IF NEW.profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM notificacoes n
    WHERE n.item_type = 'pagamento'
      AND n.item_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_payload := to_jsonb(NEW);
  v_status := UPPER(COALESCE(NEW.status, ''));

  SELECT
    c.client_id,
    COALESCE(NULLIF(TRIM(c.debtor_name), ''), NULLIF(TRIM(cli.name), ''), 'Cliente')
  INTO v_client_id, v_client_name
  FROM contratos c
  LEFT JOIN clientes cli ON cli.id = c.client_id
  WHERE c.id = NEW.loan_id
  LIMIT 1;

  IF v_status IN ('APPROVED', 'APROVADO', 'PAID', 'PAGO', 'QUITADO') THEN
    v_title := 'Pagamento confirmado';
    v_message := v_client_name || ' teve um pagamento confirmado automaticamente. Confira a baixa e o comprovante quando houver.';
  ELSIF COALESCE(TRIM(v_payload ->> 'comprovante_url'), '') <> '' THEN
    v_title := 'Comprovante aguardando conferencia';
    v_message := v_client_name || ' enviou um comprovante pelo portal do cliente. Revise o arquivo e confirme a baixa.';
  ELSE
    v_title := 'Pagamento aguardando conferencia';
    v_message := v_client_name || ' informou um pagamento pelo portal do cliente. Revise antes de dar baixa.';
  END IF;

  INSERT INTO notificacoes (
    profile_id,
    titulo,
    mensagem,
    item_type,
    item_id,
    metadata,
    created_at
  ) VALUES (
    NEW.profile_id,
    v_title,
    v_message,
    'pagamento',
    NEW.id,
    jsonb_build_object(
      'loan_id', NEW.loan_id,
      'client_id', v_client_id,
      'payment_intent_id', NEW.id,
      'status', NEW.status,
      'amount', v_payload ->> 'amount',
      'method', COALESCE(v_payload ->> 'method', v_payload ->> 'tipo'),
      'comprovante_url', v_payload ->> 'comprovante_url',
      'origem', 'payment_intents'
    ),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- 2. Recriar trigger function notify_portal_file_operator
CREATE OR REPLACE FUNCTION notify_portal_file_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_name text;
  v_title text;
  v_message text;
BEGIN
  IF NEW.profile_id IS NULL OR NEW.direction <> 'CLIENT_TO_OPERATOR' OR NEW.payment_intent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM notificacoes n
    WHERE n.item_type = 'portal_file'
      AND n.item_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(c.debtor_name), ''), NULLIF(TRIM(cli.name), ''), 'Cliente')
  INTO v_client_name
  FROM contratos c
  LEFT JOIN clientes cli ON cli.id = c.client_id
  WHERE c.id = NEW.loan_id
  LIMIT 1;

  v_title := CASE
    WHEN NEW.category = 'PAYMENT_PROOF' THEN 'Comprovante recebido'
    ELSE 'Arquivo recebido pelo portal'
  END;

  v_message := CASE
    WHEN NEW.category = 'PAYMENT_PROOF'
      THEN COALESCE(v_client_name, 'Cliente') || ' enviou um comprovante pelo portal do cliente.'
    ELSE COALESCE(v_client_name, 'Cliente') || ' enviou um arquivo pelo portal do cliente.'
  END;

  INSERT INTO notificacoes (
    profile_id,
    titulo,
    mensagem,
    item_type,
    item_id,
    metadata,
    created_at
  ) VALUES (
    NEW.profile_id,
    v_title,
    v_message,
    'portal_file',
    NEW.id,
    jsonb_build_object(
      'loan_id', NEW.loan_id,
      'client_id', NEW.client_id,
      'portal_file_id', NEW.id,
      'payment_intent_id', NEW.payment_intent_id,
      'file_url', NEW.file_url,
      'category', NEW.category,
      'origem', 'portal_files'
    ),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- 3. Recriar RPC portal_registrar_intencao
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
  v_client_name text;
  v_intent_id uuid;
  v_has_tipo boolean;
  v_has_method boolean;
  v_message text;
BEGIN
  IF p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_token_uuid := p_token::uuid;
  END IF;

  IF v_token_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso invalido');
  END IF;

  SELECT
    c.id,
    c.client_id,
    COALESCE(c.profile_id, c.owner_id),
    COALESCE(NULLIF(TRIM(c.debtor_name), ''), NULLIF(TRIM(cli.name), ''), 'Cliente')
  INTO v_loan_id, v_client_id, v_profile_id, v_client_name
  FROM contratos c
  LEFT JOIN clientes cli ON cli.id = c.client_id
  WHERE c.portal_token = v_token_uuid
    AND c.portal_shortcode = p_shortcode
    AND public.portal_status_allows_access(c.status, c.is_archived)
  LIMIT 1;

  IF v_loan_id IS NULL OR v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso invalido');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_intents'
      AND column_name = 'tipo'
  ) INTO v_has_tipo;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_intents'
      AND column_name = 'method'
  ) INTO v_has_method;

  IF v_has_tipo THEN
    INSERT INTO payment_intents (
      client_id,
      loan_id,
      profile_id,
      tipo,
      status,
      comprovante_url,
      created_at
    ) VALUES (
      v_client_id,
      v_loan_id,
      v_profile_id,
      COALESCE(NULLIF(TRIM(p_tipo), ''), 'COMPROVANTE'),
      'PENDENTE',
      p_comprovante_url,
      NOW()
    )
    RETURNING id INTO v_intent_id;
  ELSIF v_has_method THEN
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
      COALESCE(NULLIF(TRIM(p_tipo), ''), 'COMPROVANTE'),
      'PENDENTE',
      p_comprovante_url,
      NOW()
    )
    RETURNING id INTO v_intent_id;
  ELSE
    INSERT INTO payment_intents (
      client_id,
      loan_id,
      profile_id,
      status,
      comprovante_url,
      created_at
    ) VALUES (
      v_client_id,
      v_loan_id,
      v_profile_id,
      'PENDENTE',
      p_comprovante_url,
      NOW()
    )
    RETURNING id INTO v_intent_id;
  END IF;

  IF COALESCE(TRIM(p_comprovante_url), '') <> '' THEN
    INSERT INTO portal_files (
      profile_id,
      client_id,
      loan_id,
      payment_intent_id,
      direction,
      category,
      file_name,
      file_url,
      status,
      metadata
    ) VALUES (
      v_profile_id,
      v_client_id,
      v_loan_id,
      v_intent_id,
      'CLIENT_TO_OPERATOR',
      'PAYMENT_PROOF',
      split_part(p_comprovante_url, '/', array_length(string_to_array(p_comprovante_url, '/'), 1)),
      p_comprovante_url,
      'PENDING',
      jsonb_build_object(
        'origin', 'portal_cliente',
        'payment_intent_id', v_intent_id,
        'tipo', p_tipo
      )
    );
  END IF;

  v_message := CASE
    WHEN COALESCE(TRIM(p_comprovante_url), '') <> ''
      THEN v_client_name || ' enviou um comprovante pelo portal do cliente. Revise o arquivo e confirme a baixa.'
    ELSE v_client_name || ' informou um pagamento pelo portal do cliente. Revise antes de dar baixa.'
  END;

  INSERT INTO notificacoes (
    profile_id,
    titulo,
    mensagem,
    item_type,
    item_id,
    metadata,
    created_at
  )
  SELECT
    v_profile_id,
    'Pagamento aguardando conferencia',
    v_message,
    'pagamento',
    v_intent_id,
    jsonb_build_object(
      'loan_id', v_loan_id,
      'client_id', v_client_id,
      'payment_intent_id', v_intent_id,
      'comprovante_url', p_comprovante_url,
      'origem', 'portal_cliente'
    ),
    NOW()
  WHERE NOT EXISTS (
    SELECT 1
    FROM notificacoes n
    WHERE n.item_type = 'pagamento'
      AND n.item_id = v_intent_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_intent_id', v_intent_id,
    'notification_created', true
  );
END;
$$;

-- Vincular triggers para disparo automático de notificações
DROP TRIGGER IF EXISTS trg_payment_intents_operator_notification ON payment_intents;
CREATE TRIGGER trg_payment_intents_operator_notification
AFTER INSERT ON payment_intents
FOR EACH ROW
EXECUTE FUNCTION notify_payment_intent_operator();

DROP TRIGGER IF EXISTS trg_portal_files_operator_notification ON portal_files;
CREATE TRIGGER trg_portal_files_operator_notification
AFTER INSERT ON portal_files
FOR EACH ROW
EXECUTE FUNCTION notify_portal_file_operator();

NOTIFY pgrst, 'reload schema';
