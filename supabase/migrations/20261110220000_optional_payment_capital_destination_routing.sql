-- 2026-11-10: escolha opcional de Fonte de Capital de destino em recebimentos
-- para reinvestimento conjunto de Capital + Lucro/Encargos por qualquer operador.
-- Sem selecao de fonte nem de conta da Carteira, mantem exatamente o fluxo padrao.
-- Para o administrador master, a escolha da conta fisica da Minha Carteira continua
-- disponivel em conjunto ou isoladamente, preservando espelhos e estorno atomico.

ALTER TABLE public.wallet_receipt_destinations
  ALTER COLUMN account_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS destination_source_id uuid REFERENCES public.fontes(id) ON DELETE RESTRICT;

ALTER TABLE public.financial_operations
  ADD COLUMN IF NOT EXISTS destination_source_id uuid REFERENCES public.fontes(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.personal_wallet_set_receipt_destination(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.personal_wallet_set_receipt_destination(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_account_id uuid DEFAULT NULL,
  p_destination_source_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_profile uuid;
  v_account public.personal_wallet_accounts%rowtype;
  v_reference uuid;
  v_account_target uuid;
  v_record public.wallet_receipt_destinations%rowtype;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessao expirada. Entre novamente para definir o destino do recebimento.';
  END IF;

  IF p_idempotency_key IS NULL OR p_loan_id IS NULL
     OR (p_account_id IS NULL AND p_destination_source_id IS NULL) THEN
    RAISE EXCEPTION 'Identificadores de destino do recebimento invalidos.';
  END IF;

  SELECT coalesce(c.profile_id, c.owner_id)
    INTO v_profile
    FROM public.contratos c
   WHERE c.id = p_loan_id;

  IF v_profile IS NULL OR NOT private.financial_actor_can_access(v_profile) THEN
    RAISE EXCEPTION 'Contrato nao autorizado para o recebimento.';
  END IF;

  IF p_account_id IS NOT NULL THEN
    IF NOT public.is_platform_super_admin() THEN
      RAISE EXCEPTION 'A escolha da conta esta disponivel apenas ao administrador master.';
    END IF;

    SELECT *
      INTO v_account
      FROM public.personal_wallet_accounts a
     WHERE a.id = p_account_id
       AND a.owner_user_id = v_user
       AND a.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta de destino nao autorizada ou arquivada.';
    END IF;

    SELECT r.source_id
      INTO v_reference
      FROM public.capital_source_wallet_references r
     WHERE r.owner_user_id = v_user
       AND r.target_kind = 'ACCOUNT'
       AND r.target_id = p_account_id;

    IF v_reference IS NOT NULL
       AND v_account.capital_source_id IS NOT NULL
       AND v_reference <> v_account.capital_source_id THEN
      RAISE EXCEPTION 'Vinculos de Capital conflitantes na conta selecionada.';
    END IF;

    v_account_target := coalesce(v_account.capital_source_id, v_reference);

    IF p_destination_source_id IS NOT NULL
       AND v_account_target IS NOT NULL
       AND v_account_target <> p_destination_source_id THEN
      RAISE EXCEPTION 'A conta da Carteira selecionada esta vinculada a outra fonte de capital.';
    END IF;
  END IF;

  IF p_destination_source_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.fontes f
       WHERE f.id = p_destination_source_id
         AND f.profile_id = v_profile
         AND f.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Fonte de destino nao autorizada ou arquivada.';
    END IF;
  END IF;

  INSERT INTO public.wallet_receipt_destinations(
    idempotency_key, owner_user_id, loan_id, account_id, destination_source_id
  ) VALUES (
    p_idempotency_key, v_user, p_loan_id, p_account_id, p_destination_source_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT *
    INTO v_record
    FROM public.wallet_receipt_destinations
   WHERE idempotency_key = p_idempotency_key
     FOR UPDATE;

  IF v_record.owner_user_id IS DISTINCT FROM v_user
     OR v_record.loan_id IS DISTINCT FROM p_loan_id
     OR v_record.account_id IS DISTINCT FROM p_account_id
     OR v_record.destination_source_id IS DISTINCT FROM p_destination_source_id THEN
    RAISE EXCEPTION 'Chave idempotente vinculada a outro recebimento.';
  END IF;

  RETURN true;
END
$fn$;

REVOKE ALL ON FUNCTION public.personal_wallet_set_receipt_destination(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_set_receipt_destination(uuid, uuid, uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_route_receipt_internal(
  p_key uuid,
  p_loan uuid,
  p_installment uuid,
  p_profile uuid,
  p_amount numeric,
  p_principal numeric,
  p_interest numeric,
  p_late numeric,
  p_principal_source uuid,
  p_profit_source uuid,
  p_payment_date date,
  p_kind text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $fn$
DECLARE
  v_route public.wallet_receipt_destinations%rowtype;
  v_account public.personal_wallet_accounts%rowtype;
  v_reference uuid;
  v_account_target uuid;
  v_target uuid;
  v_target_balance numeric;
  v_target_delta numeric(14,2);
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_principal numeric(14,2) := round(coalesce(p_principal, 0), 2);
  v_interest numeric(14,2) := round(coalesce(p_interest, 0), 2);
  v_late numeric(14,2) := round(coalesce(p_late, 0), 2);
  v_profit numeric(14,2);
  v_client text;
  v_rows int;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  SELECT *
    INTO v_route
    FROM public.wallet_receipt_destinations
   WHERE idempotency_key = p_key
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_route.applied_at IS NOT NULL THEN
    IF v_route.loan_id IS DISTINCT FROM p_loan
       OR v_route.applied_amount IS DISTINCT FROM v_amount THEN
      RAISE EXCEPTION 'Repeticao do recebimento com dados divergentes.';
    END IF;
    RETURN;
  END IF;

  IF v_route.loan_id IS DISTINCT FROM p_loan
     OR NOT EXISTS (
       SELECT 1
         FROM public.contratos c
        WHERE c.id = p_loan
          AND coalesce(c.profile_id, c.owner_id) = p_profile
     )
     OR (
       NOT v_is_service
       AND (
         auth.uid() IS DISTINCT FROM v_route.owner_user_id
         OR NOT private.financial_actor_can_access(p_profile)
       )
     )
     OR (v_route.account_id IS NOT NULL AND NOT public.is_platform_super_admin()) THEN
    RAISE EXCEPTION 'Destino do recebimento nao autorizado.';
  END IF;

  v_profit := round(v_interest + v_late, 2);
  IF v_amount <= 0
     OR v_principal < 0
     OR v_interest < 0
     OR v_late < 0
     OR abs(v_amount - v_principal - v_profit) > 0.02
     OR (v_principal > 0 AND p_principal_source IS NULL) THEN
    RAISE EXCEPTION 'Composicao contabil nao conciliada com o valor recebido.';
  END IF;

  IF v_route.account_id IS NOT NULL THEN
    SELECT *
      INTO v_account
      FROM public.personal_wallet_accounts a
     WHERE a.id = v_route.account_id
       AND a.owner_user_id = v_route.owner_user_id
       AND a.archived_at IS NULL
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta de destino inativa ou indisponivel.';
    END IF;

    SELECT r.source_id
      INTO v_reference
      FROM public.capital_source_wallet_references r
     WHERE r.owner_user_id = v_route.owner_user_id
       AND r.target_kind = 'ACCOUNT'
       AND r.target_id = v_account.id;

    IF v_reference IS NOT NULL
       AND v_account.capital_source_id IS NOT NULL
       AND v_reference <> v_account.capital_source_id THEN
      RAISE EXCEPTION 'Vinculos de Capital conflitantes na conta selecionada.';
    END IF;

    v_account_target := coalesce(v_account.capital_source_id, v_reference);
    IF v_route.destination_source_id IS NOT NULL
       AND v_account_target IS NOT NULL
       AND v_account_target <> v_route.destination_source_id THEN
      RAISE EXCEPTION 'A conta da Carteira selecionada esta vinculada a outra fonte de capital.';
    END IF;

    v_target := coalesce(v_route.destination_source_id, v_account_target);
  ELSE
    v_target := v_route.destination_source_id;
  END IF;

  IF v_route.account_id IS NULL AND v_target IS NULL THEN
    RETURN;
  END IF;

  IF v_target IS NOT NULL THEN
    SELECT f.balance
      INTO v_target_balance
      FROM public.fontes f
     WHERE f.id = v_target
       AND f.profile_id = p_profile
       AND f.archived_at IS NULL
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fonte de destino nao pertence ao perfil ou esta arquivada.';
    END IF;

    IF v_route.account_id IS NOT NULL
       AND v_account.capital_source_id IS NOT NULL
       AND v_account.capital_source_id = v_target
       AND round(v_target_balance, 2) IS DISTINCT FROM round(coalesce(v_account.balance, 0), 2)
       AND round(v_target_balance, 2) IS DISTINCT FROM round(
         coalesce(v_account.balance, 0)
         + CASE WHEN p_principal_source = v_target THEN v_principal ELSE 0 END
         + CASE WHEN p_profit_source = v_target THEN v_profit ELSE 0 END,
         2
       ) THEN
      RAISE EXCEPTION 'Saldos de Conta e Capital divergentes; concilie antes de receber.';
    END IF;
  END IF;

  IF v_route.account_id IS NULL THEN
    -- Roteamento exclusivo para Fonte de Capital: devolve apenas o que entrou em outras
    -- fontes/lucro e direciona Capital + Lucro inteiros para v_target sem gravar duplicidade.
    IF v_principal > 0 AND p_principal_source IS DISTINCT FROM v_target THEN
      UPDATE public.fontes
         SET balance = round(balance - v_principal, 2)
       WHERE id = p_principal_source
         AND profile_id = p_profile;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fonte original de capital nao encontrada.';
      END IF;
    END IF;

    IF v_profit > 0 THEN
      IF p_profit_source IS NOT NULL THEN
        IF p_profit_source IS DISTINCT FROM v_target THEN
          UPDATE public.fontes
             SET balance = round(balance - v_profit, 2)
           WHERE id = p_profit_source
             AND profile_id = p_profile;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Fonte de lucro original nao encontrada.';
          END IF;
        END IF;
      ELSE
        UPDATE public.perfis
           SET interest_balance = round(coalesce(interest_balance, 0) - v_profit, 2)
         WHERE id = p_profile;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Saldo de lucro do perfil nao encontrado.';
        END IF;
      END IF;
    END IF;

    v_target_delta := round(
      v_amount
      - CASE WHEN p_principal_source = v_target THEN v_principal ELSE 0 END
      - CASE WHEN p_profit_source = v_target THEN v_profit ELSE 0 END,
      2
    );

    IF v_target_delta <> 0 THEN
      UPDATE public.fontes
         SET balance = round(coalesce(balance, 0) + v_target_delta, 2)
       WHERE id = v_target
         AND profile_id = p_profile;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fonte de destino nao encontrada.';
      END IF;
    END IF;
  ELSE
    IF v_principal > 0 THEN
      UPDATE public.fontes
         SET balance = round(balance - v_principal, 2)
       WHERE id = p_principal_source
         AND profile_id = p_profile;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fonte original de capital nao encontrada.';
      END IF;
    END IF;

    IF v_profit > 0 THEN
      IF p_profit_source IS NOT NULL THEN
        UPDATE public.fontes
           SET balance = round(balance - v_profit, 2)
         WHERE id = p_profit_source
           AND profile_id = p_profile;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Fonte de lucro original nao encontrada.';
        END IF;
      ELSE
        UPDATE public.perfis
           SET interest_balance = round(coalesce(interest_balance, 0) - v_profit, 2)
         WHERE id = p_profile;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Saldo de lucro do perfil nao encontrado.';
        END IF;
      END IF;
    END IF;

    IF v_target IS NOT NULL
       AND v_account.capital_source_id IS DISTINCT FROM v_target THEN
      UPDATE public.fontes
         SET balance = round(coalesce(balance, 0) + v_amount, 2)
       WHERE id = v_target
         AND profile_id = p_profile;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fonte vinculada nao encontrada.';
      END IF;
    END IF;

    UPDATE public.personal_wallet_accounts
       SET balance = round(coalesce(balance, 0) + v_amount, 2),
           updated_at = now()
     WHERE id = v_account.id
       AND owner_user_id = v_route.owner_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta selecionada nao recebeu o deposito.';
    END IF;

    SELECT nullif(btrim(c.debtor_name), '')
      INTO v_client
      FROM public.contratos c
     WHERE c.id = p_loan;

    INSERT INTO public.personal_wallet_account_operations(
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, occurred_at, contract_id, installment_id
    ) VALUES (
      v_route.owner_user_id, p_key, 'RECEIPT', NULL, v_account.id, v_amount,
      left('Recebimento de contrato' || CASE WHEN v_client IS NULL THEN '' ELSE ' · ' || v_client END, 240),
      'Recebimento de contrato', p_payment_date,
      coalesce(p_payment_date, current_date)::timestamptz, p_loan, p_installment
    ) ON CONFLICT (owner_user_id, request_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Recebimento duplicado na Carteira; transacao desfeita.';
    END IF;
  END IF;

  UPDATE public.wallet_receipt_destinations
     SET applied_at = now(),
         applied_kind = p_kind,
         applied_amount = v_amount,
         principal_paid = v_principal,
         interest_paid = v_interest,
         late_fee_paid = v_late,
         principal_source_id = p_principal_source,
         profit_source_id = p_profit_source,
         routed_source_id = v_target
   WHERE idempotency_key = p_key;
END
$fn$;

REVOKE ALL ON FUNCTION public.wallet_route_receipt_internal(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, uuid, uuid, date, text
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wallet_apply_receipt_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_route public.wallet_receipt_destinations%rowtype;
BEGIN
  IF new.status = 'COMPLETED'
     AND new.operation_type <> 'REVERSAL'
     AND new.original_operation_id IS NULL THEN
    PERFORM public.wallet_route_receipt_internal(
      new.idempotency_key,
      new.loan_id,
      new.installment_id,
      new.profile_id,
      new.amount_received,
      new.principal_paid,
      new.interest_paid,
      new.late_fee_paid,
      new.source_id,
      new.profit_source_id,
      new.payment_date,
      'V4'
    );

    SELECT *
      INTO v_route
      FROM public.wallet_receipt_destinations d
     WHERE d.idempotency_key = new.idempotency_key
       AND d.applied_at IS NOT NULL;

    IF FOUND THEN
      UPDATE public.financial_operations
         SET wallet_destination_account_id = v_route.account_id,
             destination_source_id = v_route.routed_source_id
       WHERE operation_id = new.operation_id;
    END IF;
  END IF;
  RETURN new;
END
$fn$;

REVOKE ALL ON FUNCTION public.wallet_apply_receipt_destination()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_wallet_financial_operation_v4(
  p_original_idempotency_key uuid,
  p_reversal_idempotency_key uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $fn$
DECLARE
  v_route public.wallet_receipt_destinations%rowtype;
  v_original public.financial_operations%rowtype;
  v_account public.personal_wallet_accounts%rowtype;
  v_routed_balance numeric;
  v_profit numeric(14,2);
  v_rows integer;
BEGIN
  IF p_original_idempotency_key IS NULL
     OR p_reversal_idempotency_key IS NULL
     OR nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Identificadores e motivo de estorno obrigatorios.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_original_idempotency_key::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_reversal_idempotency_key::text, 0));

  SELECT *
    INTO v_original
    FROM public.financial_operations
   WHERE idempotency_key = p_original_idempotency_key
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.reverse_financial_operation_v4(
      p_original_idempotency_key, p_reversal_idempotency_key, p_reason
    );
  END IF;

  IF NOT private.financial_actor_can_access(v_original.profile_id) THEN
    RAISE EXCEPTION 'Sem autorizacao para estornar este contrato.';
  END IF;

  SELECT *
    INTO v_route
    FROM public.wallet_receipt_destinations
   WHERE idempotency_key = p_original_idempotency_key
     FOR UPDATE;

  IF NOT FOUND OR v_route.applied_at IS NULL OR v_original.status = 'REVERSED' THEN
    RETURN public.reverse_financial_operation_v4(
      p_original_idempotency_key, p_reversal_idempotency_key, p_reason
    );
  END IF;

  IF v_route.applied_kind <> 'V4' THEN
    RAISE EXCEPTION 'Estorno de condicao especial requer conciliacao juridico-financeira.';
  END IF;

  IF v_route.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Estorno ja realizado ou sem autorizacao.';
  END IF;

  IF v_route.account_id IS NOT NULL THEN
    IF auth.uid() IS DISTINCT FROM v_route.owner_user_id
       OR NOT public.is_platform_super_admin() THEN
      RAISE EXCEPTION 'Estorno ja realizado ou sem autorizacao.';
    END IF;

    SELECT *
      INTO v_account
      FROM public.personal_wallet_accounts
     WHERE id = v_route.account_id
       AND owner_user_id = v_route.owner_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta original nao encontrada.';
    END IF;

    IF round(coalesce(v_account.balance, 0), 2) < v_route.applied_amount THEN
      RAISE EXCEPTION 'Saldo insuficiente na conta de destino para estorno.';
    END IF;

    IF v_route.routed_source_id IS NOT NULL
       AND v_account.capital_source_id IS NOT NULL
       AND v_account.capital_source_id <> v_route.routed_source_id THEN
      RAISE EXCEPTION 'Vinculo da conta alterado: concilie antes de estornar.';
    END IF;

    IF v_route.routed_source_id IS NOT NULL
       AND v_account.capital_source_id IS NOT NULL
       AND (SELECT round(balance, 2) FROM public.fontes WHERE id = v_route.routed_source_id)
           IS DISTINCT FROM round(v_account.balance, 2) THEN
      RAISE EXCEPTION 'Espelho da conta divergente, estorno bloqueado.';
    END IF;

    IF v_route.routed_source_id IS NOT NULL
       AND v_account.capital_source_id IS DISTINCT FROM v_route.routed_source_id THEN
      SELECT balance
        INTO v_routed_balance
        FROM public.fontes
       WHERE id = v_route.routed_source_id
         AND profile_id = v_original.profile_id
         FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fonte vinculada de destino nao encontrada.';
      END IF;
      IF round(coalesce(v_routed_balance, 0), 2) + 0.005 < v_route.applied_amount THEN
        RAISE EXCEPTION 'Saldo insuficiente na fonte de destino para estornar o recebimento.';
      END IF;
      UPDATE public.fontes
         SET balance = round(balance - v_route.applied_amount, 2)
       WHERE id = v_route.routed_source_id
         AND profile_id = v_original.profile_id;
    END IF;

    UPDATE public.personal_wallet_accounts
       SET balance = round(balance - v_route.applied_amount, 2),
           updated_at = now()
     WHERE id = v_route.account_id
       AND owner_user_id = v_route.owner_user_id;

    INSERT INTO public.personal_wallet_account_operations(
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, occurred_at, contract_id, installment_id
    ) VALUES (
      v_route.owner_user_id, p_reversal_idempotency_key, 'PAYMENT', v_route.account_id, NULL,
      v_route.applied_amount, left('Estorno de recebimento · ' || p_reason, 240),
      'Estorno de recebimento', current_date, now(), v_original.loan_id, v_original.installment_id
    ) ON CONFLICT (owner_user_id, request_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Chave de estorno ja utilizada na Carteira.';
    END IF;
  ELSE
    SELECT balance
      INTO v_routed_balance
      FROM public.fontes
     WHERE id = v_route.routed_source_id
       AND profile_id = v_original.profile_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fonte de destino original nao encontrada.';
    END IF;

    IF round(coalesce(v_routed_balance, 0), 2) + 0.005 < v_route.applied_amount THEN
      RAISE EXCEPTION 'Saldo insuficiente na fonte de destino para estornar o recebimento.';
    END IF;

    UPDATE public.fontes
       SET balance = round(balance - v_route.applied_amount, 2)
     WHERE id = v_route.routed_source_id
       AND profile_id = v_original.profile_id;
  END IF;

  IF v_route.principal_paid > 0 THEN
    UPDATE public.fontes
       SET balance = round(balance + v_route.principal_paid, 2)
     WHERE id = v_route.principal_source_id
       AND profile_id = v_original.profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fonte principal do contrato nao encontrada.';
    END IF;
  END IF;

  v_profit := round(coalesce(v_route.interest_paid, 0) + coalesce(v_route.late_fee_paid, 0), 2);
  IF v_profit > 0 THEN
    IF v_route.profit_source_id IS NOT NULL THEN
      UPDATE public.fontes
         SET balance = round(balance + v_profit, 2)
       WHERE id = v_route.profit_source_id
         AND profile_id = v_original.profile_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fonte original do lucro nao encontrada.';
      END IF;
    ELSE
      UPDATE public.perfis
         SET interest_balance = round(coalesce(interest_balance, 0) + v_profit, 2)
       WHERE id = v_original.profile_id;
    END IF;
  END IF;

  UPDATE public.wallet_receipt_destinations
     SET reversed_at = now(),
         reversal_idempotency_key = p_reversal_idempotency_key
   WHERE idempotency_key = p_original_idempotency_key;

  RETURN public.reverse_financial_operation_v4(
    p_original_idempotency_key, p_reversal_idempotency_key, p_reason
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.reverse_wallet_financial_operation_v4(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_wallet_financial_operation_v4(uuid, uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
