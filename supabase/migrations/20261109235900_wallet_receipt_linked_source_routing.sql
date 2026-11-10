-- Recebimento integral na conta real; capital/lucro permanecem discriminados no Payment Engine V4.
-- Não altera registros existentes: encaminhamento só para novas operações com destino explícito.
ALTER TABLE public.wallet_receipt_destinations
  ADD COLUMN IF NOT EXISTS routed_source_id uuid REFERENCES public.fontes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS was_direct_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_idempotency_key uuid;
CREATE INDEX IF NOT EXISTS wallet_receipt_destinations_applied_idx
  ON public.wallet_receipt_destinations (owner_user_id, applied_at)
  WHERE applied_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.personal_wallet_set_receipt_destination(
  p_idempotency_key uuid, p_loan_id uuid, p_account_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $route$
DECLARE
  v_user uuid := auth.uid();
  v_profile uuid;
  v_existing public.wallet_receipt_destinations%rowtype;
BEGIN
  IF v_user IS NULL OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Destino permitido apenas ao administrador master.';
  END IF;
  IF p_idempotency_key IS NULL OR p_loan_id IS NULL OR p_account_id IS NULL THEN
    RAISE EXCEPTION 'Identificadores do recebimento incompletos.';
  END IF;
  SELECT p.id INTO v_profile FROM public.perfis p
    WHERE p.user_id = v_user ORDER BY p.created_at ASC NULLS LAST LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM public.contratos c
      WHERE c.id = p_loan_id AND coalesce(c.profile_id, c.owner_id) = v_profile) THEN
    RAISE EXCEPTION 'Contrato não pertence ao administrador.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.personal_wallet_accounts a
      WHERE a.id = p_account_id AND a.owner_user_id = v_user AND a.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Escolha uma conta ativa da sua Carteira.';
  END IF;
  INSERT INTO public.wallet_receipt_destinations
    (idempotency_key, owner_user_id, loan_id, account_id)
  VALUES (p_idempotency_key, v_user, p_loan_id, p_account_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO v_existing FROM public.wallet_receipt_destinations
    WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF v_existing.owner_user_id IS DISTINCT FROM v_user
    OR v_existing.loan_id IS DISTINCT FROM p_loan_id
    OR v_existing.account_id IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'Chave de operação já vinculada a outro destino.';
  END IF;
  RETURN true;
END $route$;
REVOKE ALL ON FUNCTION public.personal_wallet_set_receipt_destination(uuid,uuid,uuid)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_set_receipt_destination(uuid,uuid,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_apply_receipt_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $apply$
DECLARE
  v_route public.wallet_receipt_destinations%rowtype;
  v_account public.personal_wallet_accounts%rowtype;
  v_reference uuid;
  v_source uuid;
  v_source_balance numeric(14,2);
  v_amount numeric(14,2);
  v_principal numeric(14,2);
  v_profit numeric(14,2);
  v_already_on_destination numeric(14,2);
  v_delta numeric(14,2);
  v_client text;
  v_rows integer;
BEGIN
  IF new.status <> 'COMPLETED' OR new.operation_type = 'REVERSAL'
    OR new.original_operation_id IS NOT NULL THEN RETURN new; END IF;
  SELECT * INTO v_route FROM public.wallet_receipt_destinations
    WHERE idempotency_key = new.idempotency_key FOR UPDATE;
  IF NOT FOUND THEN RETURN new; END IF;
  IF v_route.loan_id IS DISTINCT FROM new.loan_id THEN
    RAISE EXCEPTION 'Destino não corresponde ao contrato.';
  END IF;
  IF v_route.applied_at IS NOT NULL THEN RETURN new; END IF;
  SELECT * INTO v_account FROM public.personal_wallet_accounts a
    WHERE a.id = v_route.account_id AND a.owner_user_id = v_route.owner_user_id
      AND a.archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de destino não está disponível.'; END IF;

  -- A referência na aba Capital também é um vínculo; não exigir capital_source_id.
  SELECT r.source_id INTO v_reference FROM public.capital_source_wallet_references r
    WHERE r.owner_user_id = v_route.owner_user_id
      AND r.target_kind = 'ACCOUNT' AND r.target_id = v_account.id;
  IF v_account.capital_source_id IS NOT NULL AND v_reference IS NOT NULL
    AND v_account.capital_source_id <> v_reference THEN
    RAISE EXCEPTION 'Conta possui vínculos conflitantes com fontes de Capital.';
  END IF;
  v_source := coalesce(v_account.capital_source_id, v_reference);
  v_amount := round(coalesce(new.amount_received,0),2);
  v_principal := round(coalesce(new.principal_paid,0),2);
  v_profit := round(coalesce(new.interest_paid,0) + coalesce(new.late_fee_paid,0),2);
  IF v_amount <= 0 OR v_principal < 0 OR v_profit < 0
    OR v_principal + v_profit > v_amount + 0.005 THEN
    RAISE EXCEPTION 'Composição de recebimento incompatível com o total.';
  END IF;

  IF v_source IS NOT NULL THEN
    SELECT f.balance INTO v_source_balance FROM public.fontes f
      WHERE f.id = v_source AND f.profile_id = new.profile_id
        AND f.archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de Capital da conta não autorizada.'; END IF;
    v_already_on_destination :=
      CASE WHEN new.source_id = v_source THEN v_principal ELSE 0 END
      + CASE WHEN new.profit_source_id = v_source THEN v_profit ELSE 0 END;
    v_delta := round(v_amount - v_already_on_destination,2);
    IF v_delta < 0 THEN RAISE EXCEPTION 'Destino financeiro apresenta composição inválida.'; END IF;

    -- O vínculo direto exige espelho íntegro; nunca sobrescrever saldo divergente.
    IF v_account.capital_source_id IS NOT NULL AND
      round(v_source_balance,2) IS DISTINCT FROM
      round(v_account.balance + v_already_on_destination,2) THEN
      RAISE EXCEPTION 'Saldos divergentes entre Conta e Capital; recebimento não aplicado.';
    END IF;
    -- O motor já devolveu principal à fonte original e lucro à respectiva fonte.
    -- Redistribuir apenas quando a conta física tem outra fonte, sem gerar dinheiro extra.
    IF new.source_id IS DISTINCT FROM v_source AND v_principal > 0 THEN
      UPDATE public.fontes SET balance = round(coalesce(balance,0) - v_principal,2)
        WHERE id = new.source_id AND profile_id = new.profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte principal do contrato não encontrada.'; END IF;
    END IF;
    IF new.profit_source_id IS NOT NULL AND new.profit_source_id <> v_source AND v_profit > 0 THEN
      UPDATE public.fontes SET balance = round(coalesce(balance,0) - v_profit,2)
        WHERE id = new.profit_source_id AND profile_id = new.profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de lucro do contrato não encontrada.'; END IF;
    END IF;
    IF v_delta > 0 THEN
      UPDATE public.fontes SET balance = round(coalesce(balance,0) + v_delta,2)
        WHERE id = v_source AND profile_id = new.profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de destino não encontrada.'; END IF;
    END IF;
  END IF;

  -- Crédito físico único. O gatilho de vínculo direto encontra o saldo já reconciliado.
  UPDATE public.personal_wallet_accounts SET
    balance = round(coalesce(balance,0) + v_amount,2), updated_at = now()
    WHERE id = v_account.id AND owner_user_id = v_route.owner_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível creditar a conta escolhida.'; END IF;

  SELECT nullif(btrim(c.debtor_name),'') INTO v_client
    FROM public.contratos c WHERE c.id = new.loan_id;
  INSERT INTO public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at,contract_id,installment_id
  ) VALUES (
    v_route.owner_user_id,new.idempotency_key,'RECEIPT',null,v_account.id,
    v_amount,left('Recebimento' || case when v_client IS NULL then '' else ' · '||v_client end,240),
    'Recebimento de contrato',new.payment_date,new.payment_date::timestamptz,
    new.loan_id,new.installment_id
  ) ON CONFLICT (owner_user_id,request_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Recebimento duplicado; transação cancelada para proteger o saldo.';
  END IF;
  UPDATE public.financial_operations SET wallet_destination_account_id = v_account.id
    WHERE operation_id = new.operation_id;
  UPDATE public.wallet_receipt_destinations SET
    routed_source_id = v_source, was_direct_link = v_account.capital_source_id IS NOT NULL,
    applied_at = now()
    WHERE idempotency_key = new.idempotency_key;
  RETURN new;
END $apply$;
REVOKE ALL ON FUNCTION public.wallet_apply_receipt_destination() FROM public, anon, authenticated;

-- Recria o gatilho para garantir o mesmo comportamento em novas instalações.
DROP TRIGGER IF EXISTS trg_wallet_apply_receipt_destination ON public.financial_operations;
CREATE CONSTRAINT TRIGGER trg_wallet_apply_receipt_destination
AFTER INSERT ON public.financial_operations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.wallet_apply_receipt_destination();

-- Impede que um APK antigo estorne só o ledger e deixe a conta física creditada.
CREATE OR REPLACE FUNCTION public.wallet_guard_receipt_reversal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $guard$
BEGIN
  IF old.status = 'COMPLETED' AND new.status = 'REVERSED'
    AND EXISTS (SELECT 1 FROM public.wallet_receipt_destinations d
      WHERE d.idempotency_key = old.idempotency_key AND d.applied_at IS NOT NULL
        AND d.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Estorno com Carteira requer a rotina financeira integrada.';
  END IF;
  RETURN new;
END $guard$;
REVOKE ALL ON FUNCTION public.wallet_guard_receipt_reversal() FROM public,anon,authenticated;
DROP TRIGGER IF EXISTS trg_wallet_guard_receipt_reversal ON public.financial_operations;
CREATE TRIGGER trg_wallet_guard_receipt_reversal
BEFORE UPDATE OF status ON public.financial_operations
FOR EACH ROW EXECUTE FUNCTION public.wallet_guard_receipt_reversal();

CREATE OR REPLACE FUNCTION public.reverse_wallet_financial_operation_v4(
  p_original_idempotency_key uuid, p_reversal_idempotency_key uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp AS $reverse$
DECLARE
  v_original public.financial_operations%rowtype;
  v_route public.wallet_receipt_destinations%rowtype;
  v_account public.personal_wallet_accounts%rowtype;
  v_amount numeric(14,2);
  v_profit numeric(14,2);
  v_rows integer;
BEGIN
  IF p_original_idempotency_key IS NULL OR p_reversal_idempotency_key IS NULL
    OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Identificadores e motivo do estorno obrigatórios.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_original_idempotency_key::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_reversal_idempotency_key::text,0));
  SELECT * INTO v_original FROM public.financial_operations
    WHERE idempotency_key = p_original_idempotency_key FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.reverse_financial_operation_v4(
      p_original_idempotency_key,p_reversal_idempotency_key,p_reason);
  END IF;
  IF NOT private.financial_actor_can_access(v_original.profile_id) THEN
    RAISE EXCEPTION 'Usuário sem permissão para estornar esta operação.';
  END IF;
  SELECT * INTO v_route FROM public.wallet_receipt_destinations
    WHERE idempotency_key = p_original_idempotency_key FOR UPDATE;
  IF NOT FOUND OR v_route.applied_at IS NULL OR v_original.status = 'REVERSED' THEN
    RETURN public.reverse_financial_operation_v4(
      p_original_idempotency_key,p_reversal_idempotency_key,p_reason);
  END IF;
  IF v_route.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Estorno da Carteira já realizado por outra operação.';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() <> v_route.owner_user_id
    OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Somente o proprietário pode estornar o recebimento da Carteira.';
  END IF;
  v_amount := round(v_original.amount_received,2);
  v_profit := round(v_original.interest_paid + v_original.late_fee_paid,2);
  SELECT * INTO v_account FROM public.personal_wallet_accounts
    WHERE id = v_route.account_id AND owner_user_id = v_route.owner_user_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta original do recebimento não encontrada.'; END IF;
  IF v_route.was_direct_link AND
    v_account.capital_source_id IS DISTINCT FROM v_route.routed_source_id THEN
    RAISE EXCEPTION 'Vínculo alterado; concilie a conta antes de estornar.';
  END IF;
  IF round(coalesce(v_account.balance,0),2) < v_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta que recebeu o pagamento para estorno.';
  END IF;
  IF v_route.was_direct_link AND
    (SELECT round(balance,2) FROM public.fontes WHERE id=v_route.routed_source_id)
      IS DISTINCT FROM round(v_account.balance,2) THEN
    RAISE EXCEPTION 'Saldo de conta e fonte divergentes; estorno bloqueado.';
  END IF;
  UPDATE public.personal_wallet_accounts SET
    balance = round(balance - v_amount,2),updated_at=now()
    WHERE id=v_account.id AND owner_user_id=v_route.owner_user_id;
  IF v_route.routed_source_id IS NOT NULL THEN
    -- Vínculo direto já ajustou a fonte pelo gatilho de espelhamento.
    IF NOT v_route.was_direct_link THEN
      UPDATE public.fontes SET balance = round(balance - v_amount,2)
        WHERE id=v_route.routed_source_id AND profile_id=v_original.profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de destino não encontrada.'; END IF;
    END IF;
    -- Repõe provisoriamente as parcelas nas fontes originais. O estorno V4
    -- retira esses mesmos valores, preservando o estado anterior ao recebimento.
    IF v_original.principal_paid > 0 THEN
      UPDATE public.fontes SET balance=round(balance+v_original.principal_paid,2)
        WHERE id=v_original.source_id AND profile_id=v_original.profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte principal não encontrada.'; END IF;
    END IF;
    IF v_original.profit_source_id IS NOT NULL AND v_profit > 0 THEN
      UPDATE public.fontes SET balance=round(balance+v_profit,2)
        WHERE id=v_original.profit_source_id AND profile_id=v_original.profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de lucro não encontrada.'; END IF;
    END IF;
  END IF;
  INSERT INTO public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at,contract_id,installment_id
  ) VALUES (
    v_route.owner_user_id,p_reversal_idempotency_key,'PAYMENT',v_account.id,null,
    v_amount,left('Estorno de recebimento · '||left(p_reason,180),240),
    'Estorno de contrato',(now() at time zone 'America/Manaus')::date,now(),
    v_original.loan_id,v_original.installment_id
  ) ON CONFLICT (owner_user_id,request_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Estorno duplicado; operação cancelada.'; END IF;
  UPDATE public.wallet_receipt_destinations SET
    reversed_at=now(),reversal_idempotency_key=p_reversal_idempotency_key
    WHERE idempotency_key=p_original_idempotency_key;
  RETURN public.reverse_financial_operation_v4(
    p_original_idempotency_key,p_reversal_idempotency_key,p_reason);
END $reverse$;
REVOKE ALL ON FUNCTION public.reverse_wallet_financial_operation_v4(uuid,uuid,text)
  FROM public,anon;
GRANT EXECUTE ON FUNCTION public.reverse_wallet_financial_operation_v4(uuid,uuid,text)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
