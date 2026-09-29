SET search_path = public;

DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, date, boolean, uuid, uuid);

CREATE OR REPLACE FUNCTION process_payment_v3_selective(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_installment_id uuid,
  p_profile_id uuid,
  p_operator_id uuid,
  p_principal_paid numeric,
  p_interest_paid numeric,
  p_late_fee_paid numeric,
  p_late_fee_forgiven numeric,
  p_interest_forgiven numeric,
  p_payment_date date,
  p_capitalize_remaining boolean,
  p_source_id uuid,
  p_caixa_livre_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_paid numeric;
  v_profit_total numeric;
  v_open_total numeric;
  v_remaining_total numeric;
  v_profit_source_id uuid;
  v_base_key text;
BEGIN
  v_base_key := p_idempotency_key::text;

  IF EXISTS (
    SELECT 1
    FROM transacoes
    WHERE idempotency_key = v_base_key
  ) THEN
    RETURN;
  END IF;

  v_total_paid := COALESCE(p_principal_paid, 0) + COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);
  v_profit_total := COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);

  IF v_total_paid < 0 THEN
    RAISE EXCEPTION 'Valor do recebimento nao pode ser negativo.';
  END IF;

  SELECT COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
  INTO v_open_total
  FROM parcelas
  WHERE id = p_installment_id
    AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  IF v_open_total <= 0.05 AND v_total_paid <= 0.05 THEN
    RAISE EXCEPTION 'Parcela ja esta quitada.';
  END IF;

  UPDATE parcelas
  SET
    principal_remaining = GREATEST(0, COALESCE(principal_remaining, 0) - COALESCE(p_principal_paid, 0)),
    interest_remaining = GREATEST(0, COALESCE(interest_remaining, 0) - COALESCE(p_interest_paid, 0) - COALESCE(p_interest_forgiven, 0)),
    late_fee_accrued = GREATEST(0, COALESCE(late_fee_accrued, 0) - COALESCE(p_late_fee_paid, 0) - COALESCE(p_late_fee_forgiven, 0)),
    paid_principal = COALESCE(paid_principal, 0) + COALESCE(p_principal_paid, 0),
    paid_interest = COALESCE(paid_interest, 0) + COALESCE(p_interest_paid, 0),
    paid_late_fee = COALESCE(paid_late_fee, 0) + COALESCE(p_late_fee_paid, 0),
    paid_total = COALESCE(paid_total, 0) + v_total_paid,
    paid_date = p_payment_date
  WHERE id = p_installment_id
    AND loan_id = p_loan_id;

  SELECT COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
  INTO v_remaining_total
  FROM parcelas
  WHERE id = p_installment_id;

  UPDATE parcelas
  SET status = CASE WHEN v_remaining_total <= 0.05 THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_installment_id;

  IF COALESCE(p_principal_paid, 0) > 0 THEN
    UPDATE fontes
    SET balance = COALESCE(balance, 0) + p_principal_paid
    WHERE id = p_source_id;

    INSERT INTO transacoes (
      id, profile_id, loan_id, source_id, type, amount,
      principal_delta, interest_delta, late_fee_delta, date,
      notes, category, idempotency_key
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_source_id, 'PAYMENT', p_principal_paid,
      p_principal_paid, 0, 0, p_payment_date,
      'Retorno de Capital (Principal)', 'PAGAMENTO', v_base_key
    );
  END IF;

  IF v_profit_total > 0 THEN
    v_profit_source_id := p_caixa_livre_id;

    IF v_profit_source_id IS NULL THEN
      SELECT id
      INTO v_profit_source_id
      FROM fontes
      WHERE profile_id = p_profile_id
        AND (
          lower(COALESCE(nome, '')) LIKE '%caixa livre%'
          OR lower(COALESCE(nome, '')) LIKE '%lucro%'
          OR lower(COALESCE(nome, '')) LIKE '%disponivel%'
        )
      LIMIT 1;
    END IF;

    IF v_profit_source_id IS NOT NULL THEN
      UPDATE fontes
      SET balance = COALESCE(balance, 0) + v_profit_total
      WHERE id = v_profit_source_id;

      INSERT INTO transacoes (
        id, profile_id, loan_id, source_id, type, amount,
        principal_delta, interest_delta, late_fee_delta, date,
        notes, category, idempotency_key
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, v_profit_source_id, 'PAYMENT', v_profit_total,
        0, p_interest_paid, p_late_fee_paid, p_payment_date,
        'Recebimento de Lucro (Juros/Mora)', 'LUCRO', v_base_key || '_lucro'
      );
    ELSE
      UPDATE perfis
      SET interest_balance = COALESCE(interest_balance, 0) + v_profit_total
      WHERE id = p_profile_id;

      INSERT INTO transacoes (
        id, profile_id, loan_id, type, amount,
        principal_delta, interest_delta, late_fee_delta, date,
        notes, category, idempotency_key
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, 'PAYMENT', v_profit_total,
        0, p_interest_paid, p_late_fee_paid, p_payment_date,
        'Recebimento de Lucro (Saldo Perfil)', 'LUCRO', v_base_key || '_lucro'
      );
    END IF;
  END IF;

  IF p_capitalize_remaining AND v_remaining_total > 0.05 THEN
    UPDATE parcelas
    SET
      principal_remaining = COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0),
      interest_remaining = 0,
      late_fee_accrued = 0
    WHERE id = p_installment_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM parcelas
    WHERE loan_id = p_loan_id
      AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
      AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
  ) THEN
    UPDATE contratos
    SET status = 'PAID'
    WHERE id = p_loan_id;
  ELSE
    UPDATE contratos
    SET status = CASE WHEN upper(COALESCE(status, '')) = 'PAID' THEN 'ATIVO' ELSE status END
    WHERE id = p_loan_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION process_payment_v3_selective(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION sync_paid_installment_status(
  p_loan_id uuid,
  p_installment_id uuid,
  p_payment_date date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining numeric;
  v_loan_remaining numeric;
  v_status text;
BEGIN
  SELECT
    COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0),
    upper(COALESCE(status, ''))
  INTO v_remaining, v_status
  FROM parcelas
  WHERE id = p_installment_id
    AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Parcela nao encontrada.');
  END IF;

  IF v_remaining > 0.05 AND v_status IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO') THEN
    UPDATE parcelas
    SET
      principal_remaining = 0,
      interest_remaining = 0,
      late_fee_accrued = 0,
      status = 'PAID',
      paid_date = COALESCE(paid_date, p_payment_date)
    WHERE id = p_installment_id
      AND loan_id = p_loan_id;

    v_remaining := 0;
  END IF;

  IF v_remaining > 0.05 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Parcela ainda possui saldo em aberto.',
      'remaining', v_remaining,
      'status', v_status
    );
  END IF;

  UPDATE parcelas
  SET
    status = 'PAID',
    paid_date = COALESCE(paid_date, p_payment_date)
  WHERE id = p_installment_id
    AND loan_id = p_loan_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN upper(COALESCE(status, '')) IN ('RENEGOCIADO', 'CANCELADO') THEN 0
      ELSE COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
    END
  ), 0)
  INTO v_loan_remaining
  FROM parcelas
  WHERE loan_id = p_loan_id;

  UPDATE contratos
  SET
    status = CASE WHEN v_loan_remaining <= 0.05 THEN 'PAID' ELSE status END
  WHERE id = p_loan_id;

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining,
    'loan_remaining', v_loan_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_paid_installment_status(uuid, uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cf_column_exists(
  p_table_name text,
  p_column_name text
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  );
$$;

CREATE OR REPLACE FUNCTION public.delete_contract_atomic(
  p_loan_id uuid,
  p_owner_id uuid,
  p_refund boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
  v_remaining_principal numeric := 0;
  v_refunded numeric := 0;
  v_deleted_count integer := 0;
  v_agreement_ids uuid[] := ARRAY[]::uuid[];
  v_agreement_installment_ids uuid[] := ARRAY[]::uuid[];
  v_installment_ids uuid[] := ARRAY[]::uuid[];
  v_document_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_loan_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Contrato ou perfil invalido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.id = p_owner_id
      AND (
        p.user_id = auth.uid()
        OR p.email = auth.jwt() ->> 'email'
        OR p.usuario_email = auth.jwt() ->> 'email'
        OR p.id IN (SELECT supervisor_id FROM public.perfis WHERE user_id = auth.uid())
        OR p.supervisor_id IN (SELECT id FROM public.perfis WHERE user_id = auth.uid())
      )
  ) THEN
    RAISE EXCEPTION 'Acesso negado para excluir este contrato.';
  END IF;

  SELECT *
  INTO v_contract
  FROM public.contratos
  WHERE id = p_loan_id
    AND (owner_id = p_owner_id OR profile_id = p_owner_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado ou ja excluido.';
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_installment_ids
  FROM public.parcelas
  WHERE loan_id = p_loan_id;

  SELECT coalesce(sum(coalesce(principal_remaining, 0)), 0)
  INTO v_remaining_principal
  FROM public.parcelas
  WHERE loan_id = p_loan_id;

  IF coalesce(array_length(v_installment_ids, 1), 0) = 0 THEN
    v_remaining_principal := coalesce(v_contract.principal, 0);
  END IF;

  IF p_refund AND v_contract.source_id IS NOT NULL AND v_remaining_principal > 0 THEN
    UPDATE public.fontes
    SET balance = coalesce(balance, 0) + v_remaining_principal
    WHERE id = v_contract.source_id
      AND profile_id = p_owner_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
      v_refunded := v_remaining_principal;
    END IF;
  END IF;

  IF to_regclass('public.acordos_inadimplencia') IS NOT NULL
     AND public.cf_column_exists('acordos_inadimplencia', 'loan_id') THEN
    EXECUTE 'SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) FROM public.acordos_inadimplencia WHERE loan_id = $1'
    INTO v_agreement_ids
    USING p_loan_id;
  END IF;

  IF to_regclass('public.acordo_parcelas') IS NOT NULL THEN
    IF public.cf_column_exists('acordo_parcelas', 'acordo_id')
       AND public.cf_column_exists('acordo_parcelas', 'loan_id') THEN
      EXECUTE 'SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) FROM public.acordo_parcelas WHERE acordo_id = ANY($1) OR loan_id = $2'
      INTO v_agreement_installment_ids
      USING v_agreement_ids, p_loan_id;
    ELSIF public.cf_column_exists('acordo_parcelas', 'acordo_id') THEN
      EXECUTE 'SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) FROM public.acordo_parcelas WHERE acordo_id = ANY($1)'
      INTO v_agreement_installment_ids
      USING v_agreement_ids;
    ELSIF public.cf_column_exists('acordo_parcelas', 'loan_id') THEN
      EXECUTE 'SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) FROM public.acordo_parcelas WHERE loan_id = $1'
      INTO v_agreement_installment_ids
      USING p_loan_id;
    END IF;
  END IF;

  IF to_regclass('public.documentos_juridicos') IS NOT NULL THEN
    IF public.cf_column_exists('documentos_juridicos', 'loan_id')
       AND public.cf_column_exists('documentos_juridicos', 'acordo_id')
       AND to_regclass('public.acordos_inadimplencia') IS NOT NULL
       AND public.cf_column_exists('acordos_inadimplencia', 'legal_document_id') THEN
      EXECUTE '
        SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[])
        FROM public.documentos_juridicos
        WHERE loan_id::text = $1::text
           OR acordo_id = ANY($2)
           OR id IN (
             SELECT legal_document_id
             FROM public.acordos_inadimplencia
             WHERE id = ANY($2)
               AND legal_document_id IS NOT NULL
           )'
      INTO v_document_ids
      USING p_loan_id, v_agreement_ids;
    ELSIF public.cf_column_exists('documentos_juridicos', 'loan_id')
       AND public.cf_column_exists('documentos_juridicos', 'acordo_id') THEN
      EXECUTE '
        SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[])
        FROM public.documentos_juridicos
        WHERE loan_id::text = $1::text
           OR acordo_id = ANY($2)'
      INTO v_document_ids
      USING p_loan_id, v_agreement_ids;
    ELSIF public.cf_column_exists('documentos_juridicos', 'loan_id') THEN
      EXECUTE 'SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[]) FROM public.documentos_juridicos WHERE loan_id::text = $1::text'
      INTO v_document_ids
      USING p_loan_id;
    ELSIF public.cf_column_exists('documentos_juridicos', 'acordo_id') THEN
      EXECUTE 'SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[]) FROM public.documentos_juridicos WHERE acordo_id = ANY($1)'
      INTO v_document_ids
      USING v_agreement_ids;
    ELSIF to_regclass('public.acordos_inadimplencia') IS NOT NULL
       AND public.cf_column_exists('acordos_inadimplencia', 'legal_document_id') THEN
      EXECUTE '
        SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[])
        FROM public.documentos_juridicos
        WHERE id IN (
          SELECT legal_document_id
          FROM public.acordos_inadimplencia
          WHERE id = ANY($1)
            AND legal_document_id IS NOT NULL
        )'
      INTO v_document_ids
      USING v_agreement_ids;
    END IF;
  END IF;

  IF public.cf_column_exists('contratos', 'acordo_ativo_id') THEN
    UPDATE public.contratos
    SET acordo_ativo_id = NULL
    WHERE id = p_loan_id;
  END IF;

  IF to_regclass('public.acordos_inadimplencia') IS NOT NULL
     AND public.cf_column_exists('acordos_inadimplencia', 'legal_document_id') THEN
    EXECUTE 'UPDATE public.acordos_inadimplencia SET legal_document_id = NULL WHERE id = ANY($1)'
    USING v_agreement_ids;
  END IF;

  IF to_regclass('public.payment_reversals') IS NOT NULL THEN
    IF public.cf_column_exists('payment_reversals', 'payment_id')
       AND public.cf_column_exists('payment_transactions', 'id')
       AND public.cf_column_exists('payment_transactions', 'contract_id')
       AND public.cf_column_exists('payment_transactions', 'installment_id') THEN
      EXECUTE '
        DELETE FROM public.payment_reversals
        WHERE payment_id IN (
          SELECT id FROM public.payment_transactions
          WHERE contract_id = $1 OR installment_id = ANY($2)
        )'
      USING p_loan_id, v_installment_ids;
    ELSIF public.cf_column_exists('payment_reversals', 'payment_id')
       AND public.cf_column_exists('payment_transactions', 'id')
       AND public.cf_column_exists('payment_transactions', 'contract_id') THEN
      EXECUTE '
        DELETE FROM public.payment_reversals
        WHERE payment_id IN (
          SELECT id FROM public.payment_transactions
          WHERE contract_id = $1
        )'
      USING p_loan_id;
    ELSIF public.cf_column_exists('payment_reversals', 'payment_id')
       AND public.cf_column_exists('payment_transactions', 'id')
       AND public.cf_column_exists('payment_transactions', 'installment_id') THEN
      EXECUTE '
        DELETE FROM public.payment_reversals
        WHERE payment_id IN (
          SELECT id FROM public.payment_transactions
          WHERE installment_id = ANY($1)
        )'
      USING v_installment_ids;
    END IF;

    IF public.cf_column_exists('payment_reversals', 'installment_id') THEN
      EXECUTE 'DELETE FROM public.payment_reversals WHERE installment_id = ANY($1)'
      USING v_installment_ids;
    END IF;
  END IF;

  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    IF public.cf_column_exists('payment_transactions', 'contract_id')
       AND public.cf_column_exists('payment_transactions', 'installment_id') THEN
      EXECUTE 'DELETE FROM public.payment_transactions WHERE contract_id = $1 OR installment_id = ANY($2)'
      USING p_loan_id, v_installment_ids;
    ELSIF public.cf_column_exists('payment_transactions', 'contract_id') THEN
      EXECUTE 'DELETE FROM public.payment_transactions WHERE contract_id = $1'
      USING p_loan_id;
    ELSIF public.cf_column_exists('payment_transactions', 'installment_id') THEN
      EXECUTE 'DELETE FROM public.payment_transactions WHERE installment_id = ANY($1)'
      USING v_installment_ids;
    END IF;
  END IF;

  IF to_regclass('public.whatsapp_queue') IS NOT NULL THEN
    IF public.cf_column_exists('whatsapp_queue', 'loan_id')
       AND public.cf_column_exists('whatsapp_queue', 'parcela_id') THEN
      EXECUTE 'DELETE FROM public.whatsapp_queue WHERE loan_id = $1 OR parcela_id = ANY($2)'
      USING p_loan_id, v_installment_ids;
    ELSIF public.cf_column_exists('whatsapp_queue', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.whatsapp_queue WHERE loan_id = $1'
      USING p_loan_id;
    ELSIF public.cf_column_exists('whatsapp_queue', 'parcela_id') THEN
      EXECUTE 'DELETE FROM public.whatsapp_queue WHERE parcela_id = ANY($1)'
      USING v_installment_ids;
    END IF;
  END IF;

  IF to_regclass('public.portal_files') IS NOT NULL
     AND public.cf_column_exists('portal_files', 'loan_id') THEN
    EXECUTE 'DELETE FROM public.portal_files WHERE loan_id = $1'
    USING p_loan_id;
  END IF;

  IF to_regclass('public.acordo_pagamentos') IS NOT NULL THEN
    IF public.cf_column_exists('acordo_pagamentos', 'acordo_id')
       AND public.cf_column_exists('acordo_pagamentos', 'parcela_id') THEN
      EXECUTE 'DELETE FROM public.acordo_pagamentos WHERE acordo_id = ANY($1) OR parcela_id = ANY($2)'
      USING v_agreement_ids, v_agreement_installment_ids;
    ELSIF public.cf_column_exists('acordo_pagamentos', 'acordo_id') THEN
      EXECUTE 'DELETE FROM public.acordo_pagamentos WHERE acordo_id = ANY($1)'
      USING v_agreement_ids;
    ELSIF public.cf_column_exists('acordo_pagamentos', 'parcela_id') THEN
      EXECUTE 'DELETE FROM public.acordo_pagamentos WHERE parcela_id = ANY($1)'
      USING v_agreement_installment_ids;
    END IF;
  END IF;

  IF to_regclass('public.acordo_parcelas') IS NOT NULL THEN
    IF public.cf_column_exists('acordo_parcelas', 'acordo_id')
       AND public.cf_column_exists('acordo_parcelas', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.acordo_parcelas WHERE acordo_id = ANY($1) OR loan_id = $2'
      USING v_agreement_ids, p_loan_id;
    ELSIF public.cf_column_exists('acordo_parcelas', 'acordo_id') THEN
      EXECUTE 'DELETE FROM public.acordo_parcelas WHERE acordo_id = ANY($1)'
      USING v_agreement_ids;
    ELSIF public.cf_column_exists('acordo_parcelas', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.acordo_parcelas WHERE loan_id = $1'
      USING p_loan_id;
    END IF;
  END IF;

  IF to_regclass('public.acordo_documentos') IS NOT NULL THEN
    IF public.cf_column_exists('acordo_documentos', 'acordo_id')
       AND public.cf_column_exists('acordo_documentos', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.acordo_documentos WHERE acordo_id = ANY($1) OR loan_id = $2'
      USING v_agreement_ids, p_loan_id;
    ELSIF public.cf_column_exists('acordo_documentos', 'acordo_id') THEN
      EXECUTE 'DELETE FROM public.acordo_documentos WHERE acordo_id = ANY($1)'
      USING v_agreement_ids;
    ELSIF public.cf_column_exists('acordo_documentos', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.acordo_documentos WHERE loan_id = $1'
      USING p_loan_id;
    END IF;
  END IF;

  IF to_regclass('public.assinaturas_documento') IS NOT NULL
     AND public.cf_column_exists('assinaturas_documento', 'document_id') THEN
    EXECUTE 'DELETE FROM public.assinaturas_documento WHERE document_id = ANY($1)'
    USING v_document_ids;
  END IF;

  IF to_regclass('public.logs_assinatura') IS NOT NULL
     AND public.cf_column_exists('logs_assinatura', 'documento_id') THEN
    EXECUTE 'DELETE FROM public.logs_assinatura WHERE documento_id = ANY($1)'
    USING v_document_ids;
  END IF;

  IF to_regclass('public.portal_doc_tokens') IS NOT NULL
     AND public.cf_column_exists('portal_doc_tokens', 'documento_id') THEN
    EXECUTE 'DELETE FROM public.portal_doc_tokens WHERE documento_id = ANY($1)'
    USING v_document_ids;
  END IF;

  IF to_regclass('public.documentos_juridicos') IS NOT NULL THEN
    IF public.cf_column_exists('documentos_juridicos', 'loan_id')
       AND public.cf_column_exists('documentos_juridicos', 'acordo_id') THEN
      EXECUTE 'DELETE FROM public.documentos_juridicos WHERE id = ANY($1) OR loan_id::text = $2::text OR acordo_id = ANY($3)'
      USING v_document_ids, p_loan_id, v_agreement_ids;
    ELSIF public.cf_column_exists('documentos_juridicos', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.documentos_juridicos WHERE id = ANY($1) OR loan_id::text = $2::text'
      USING v_document_ids, p_loan_id;
    ELSIF public.cf_column_exists('documentos_juridicos', 'acordo_id') THEN
      EXECUTE 'DELETE FROM public.documentos_juridicos WHERE id = ANY($1) OR acordo_id = ANY($2)'
      USING v_document_ids, v_agreement_ids;
    ELSE
      EXECUTE 'DELETE FROM public.documentos_juridicos WHERE id = ANY($1)'
      USING v_document_ids;
    END IF;
  END IF;

  IF to_regclass('public.payment_intents') IS NOT NULL
     AND public.cf_column_exists('payment_intents', 'loan_id') THEN
    EXECUTE 'DELETE FROM public.payment_intents WHERE loan_id = $1'
    USING p_loan_id;
  END IF;

  IF to_regclass('public.sinalizacoes_pagamento') IS NOT NULL
     AND public.cf_column_exists('sinalizacoes_pagamento', 'loan_id') THEN
    EXECUTE 'DELETE FROM public.sinalizacoes_pagamento WHERE loan_id = $1'
    USING p_loan_id;
  END IF;

  IF to_regclass('public.mensagens_suporte') IS NOT NULL
     AND public.cf_column_exists('mensagens_suporte', 'loan_id') THEN
    EXECUTE 'DELETE FROM public.mensagens_suporte WHERE loan_id = $1'
    USING p_loan_id;
  END IF;

  IF to_regclass('public.ledger_entries') IS NOT NULL
     AND public.cf_column_exists('ledger_entries', 'loan_id') THEN
    EXECUTE 'DELETE FROM public.ledger_entries WHERE loan_id = $1'
    USING p_loan_id;
  END IF;

  IF to_regclass('public.portal_tokens') IS NOT NULL
     AND public.cf_column_exists('portal_tokens', 'loan_id') THEN
    EXECUTE 'DELETE FROM public.portal_tokens WHERE loan_id = $1'
    USING p_loan_id;
  END IF;

  IF to_regclass('public.portal_sessions') IS NOT NULL
     AND public.cf_column_exists('portal_sessions', 'loan_id') THEN
    EXECUTE 'DELETE FROM public.portal_sessions WHERE loan_id = $1'
    USING p_loan_id;
  END IF;

  IF to_regclass('public.transacoes') IS NOT NULL THEN
    IF public.cf_column_exists('transacoes', 'loan_id')
       AND public.cf_column_exists('transacoes', 'installment_id') THEN
      EXECUTE 'DELETE FROM public.transacoes WHERE loan_id = $1 OR installment_id = ANY($2)'
      USING p_loan_id, v_installment_ids;
    ELSIF public.cf_column_exists('transacoes', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.transacoes WHERE loan_id = $1'
      USING p_loan_id;
    ELSIF public.cf_column_exists('transacoes', 'installment_id') THEN
      EXECUTE 'DELETE FROM public.transacoes WHERE installment_id = ANY($1)'
      USING v_installment_ids;
    END IF;
  END IF;

  DELETE FROM public.parcelas
  WHERE loan_id = p_loan_id;

  IF to_regclass('public.acordos_inadimplencia') IS NOT NULL THEN
    IF public.cf_column_exists('acordos_inadimplencia', 'loan_id') THEN
      EXECUTE 'DELETE FROM public.acordos_inadimplencia WHERE id = ANY($1) OR loan_id = $2'
      USING v_agreement_ids, p_loan_id;
    ELSE
      EXECUTE 'DELETE FROM public.acordos_inadimplencia WHERE id = ANY($1)'
      USING v_agreement_ids;
    END IF;
  END IF;

  DELETE FROM public.contratos
  WHERE id = p_loan_id
    AND (owner_id = p_owner_id OR profile_id = p_owner_id);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'Contrato nao foi excluido.';
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'loan_id', p_loan_id,
    'refunded_amount', v_refunded,
    'source_id', v_contract.source_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_contract_atomic(uuid, uuid, boolean) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.payment_transactions') IS NOT NULL
     AND public.cf_column_exists('payment_transactions', 'installment_id')
     AND public.cf_column_exists('payment_transactions', 'contract_id')
     AND to_regclass('public.parcelas') IS NOT NULL
     AND to_regclass('public.contratos') IS NOT NULL THEN
    ALTER TABLE public.payment_transactions
      DROP CONSTRAINT IF EXISTS payment_transactions_installment_id_fkey;

    ALTER TABLE public.payment_transactions
      DROP CONSTRAINT IF EXISTS payment_transactions_contract_id_fkey;

    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_installment_id_fkey
      FOREIGN KEY (installment_id) REFERENCES public.parcelas(id) ON DELETE CASCADE;

    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.contratos(id) ON DELETE CASCADE;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
