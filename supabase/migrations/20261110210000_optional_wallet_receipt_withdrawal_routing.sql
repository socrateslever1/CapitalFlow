-- 2026-11-10: roteamento opcional e atomico de recebimentos e resgates.
-- Sem destino selecionado, nenhuma funcao abaixo interfere no fluxo existente.
-- O saldo da Carteira e fisico; capital/juros permanecem discriminados no ledger.
ALTER TABLE public.wallet_receipt_destinations
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_kind text,
  ADD COLUMN IF NOT EXISTS applied_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS principal_paid numeric(14,2),
  ADD COLUMN IF NOT EXISTS interest_paid numeric(14,2),
  ADD COLUMN IF NOT EXISTS late_fee_paid numeric(14,2),
  ADD COLUMN IF NOT EXISTS principal_source_id uuid,
  ADD COLUMN IF NOT EXISTS profit_source_id uuid,
  ADD COLUMN IF NOT EXISTS routed_source_id uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_idempotency_key uuid;
CREATE INDEX IF NOT EXISTS wallet_receipt_destination_applied_idx
  ON public.wallet_receipt_destinations(owner_user_id,applied_at)
  WHERE applied_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.personal_wallet_set_receipt_destination(
  p_idempotency_key uuid,p_loan_id uuid,p_account_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid:=auth.uid(); v_profile uuid;
  v_record public.wallet_receipt_destinations%rowtype;
BEGIN
  IF v_user IS NULL OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'A escolha da conta esta disponivel apenas ao administrador master.';
  END IF;
  IF p_idempotency_key IS NULL OR p_loan_id IS NULL OR p_account_id IS NULL THEN
    RAISE EXCEPTION 'Identificadores de recebimento invalidos.';
  END IF;
  SELECT id INTO v_profile FROM public.perfis WHERE user_id=v_user
    ORDER BY created_at ASC NULLS LAST LIMIT 1;
  IF v_profile IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.contratos WHERE id=p_loan_id
      AND coalesce(profile_id,owner_id)=v_profile
  ) THEN RAISE EXCEPTION 'Contrato nao autorizado para o recebimento.'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.personal_wallet_accounts
      WHERE id=p_account_id AND owner_user_id=v_user AND archived_at IS NULL
  ) THEN RAISE EXCEPTION 'Conta de destino nao autorizada ou arquivada.'; END IF;
  INSERT INTO public.wallet_receipt_destinations(
    idempotency_key,owner_user_id,loan_id,account_id
  ) VALUES(p_idempotency_key,v_user,p_loan_id,p_account_id)
  ON CONFLICT(idempotency_key) DO NOTHING;
  SELECT * INTO v_record FROM public.wallet_receipt_destinations
    WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_record.owner_user_id IS DISTINCT FROM v_user
    OR v_record.loan_id IS DISTINCT FROM p_loan_id
    OR v_record.account_id IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'Chave idempotente vinculada a outro recebimento.';
  END IF;
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.personal_wallet_set_receipt_destination(uuid,uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_set_receipt_destination(uuid,uuid,uuid)
  TO authenticated;

-- Funcao interna: sempre invocada na MESMA transacao do pagamento.
CREATE OR REPLACE FUNCTION public.wallet_route_receipt_internal(
  p_key uuid,p_loan uuid,p_installment uuid,p_profile uuid,
  p_amount numeric,p_principal numeric,p_interest numeric,p_late numeric,
  p_principal_source uuid,p_profit_source uuid,p_payment_date date,p_kind text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
DECLARE v_route public.wallet_receipt_destinations%rowtype;
  v_account public.personal_wallet_accounts%rowtype;
  v_reference uuid; v_target uuid; v_target_balance numeric;
  v_amount numeric(14,2):=round(coalesce(p_amount,0),2);
  v_principal numeric(14,2):=round(coalesce(p_principal,0),2);
  v_interest numeric(14,2):=round(coalesce(p_interest,0),2);
  v_late numeric(14,2):=round(coalesce(p_late,0),2);
  v_profit numeric(14,2); v_client text; v_existing record; v_rows int;
BEGIN
  SELECT * INTO v_route FROM public.wallet_receipt_destinations
    WHERE idempotency_key=p_key FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_route.applied_at IS NOT NULL THEN
    IF v_route.loan_id IS DISTINCT FROM p_loan OR
      v_route.applied_amount IS DISTINCT FROM v_amount THEN
      RAISE EXCEPTION 'Repeticao do recebimento com dados divergentes.';
    END IF;
    RETURN;
  END IF;
  IF v_route.loan_id IS DISTINCT FROM p_loan
    OR NOT EXISTS(SELECT 1 FROM public.perfis
      WHERE id=p_profile AND user_id=v_route.owner_user_id)
    OR auth.uid() IS DISTINCT FROM v_route.owner_user_id
    OR NOT public.is_platform_super_admin()
    OR NOT EXISTS(SELECT 1 FROM public.contratos
      WHERE id=p_loan AND profile_id=p_profile) THEN
    RAISE EXCEPTION 'Destino do recebimento nao autorizado.';
  END IF;
  v_profit:=round(v_interest+v_late,2);
  IF v_amount<=0 OR v_principal<0 OR v_interest<0 OR v_late<0
    OR abs(v_amount-v_principal-v_profit)>0.02
    OR (v_principal>0 AND p_principal_source IS NULL) THEN
    RAISE EXCEPTION 'Composicao contabil nao conciliada com o valor recebido.';
  END IF;
  SELECT * INTO v_account FROM public.personal_wallet_accounts
    WHERE id=v_route.account_id AND owner_user_id=v_route.owner_user_id
      AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de destino inativa ou indisponivel.'; END IF;
  SELECT source_id INTO v_reference
    FROM public.capital_source_wallet_references
    WHERE owner_user_id=v_route.owner_user_id AND target_kind='ACCOUNT'
      AND target_id=v_account.id;
  IF v_reference IS NOT NULL AND v_account.capital_source_id IS NOT NULL
    AND v_reference<>v_account.capital_source_id THEN
    RAISE EXCEPTION 'Vinculos de Capital conflitantes na conta selecionada.';
  END IF;
  v_target:=coalesce(v_account.capital_source_id,v_reference);
  IF v_target IS NOT NULL THEN
    SELECT balance INTO v_target_balance FROM public.fontes
      WHERE id=v_target AND profile_id=p_profile AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte vinculada nao pertence ao perfil.'; END IF;
    -- Espelho direto tem de estar consistente ANTES do deposito.
    -- O pagamento ja creditou as parcelas nas fontes originais do V4/V3.
    IF v_account.capital_source_id IS NOT NULL AND
      round(v_target_balance,2) IS DISTINCT FROM round(
        coalesce(v_account.balance,0)
        + CASE WHEN p_principal_source=v_target THEN v_principal ELSE 0 END
        + CASE WHEN p_profit_source=v_target THEN v_profit ELSE 0 END,2) THEN
      RAISE EXCEPTION 'Saldos de Conta e Capital divergentes; concilie antes de receber.';
    END IF;
  END IF;
  -- O motor financeiro registrou o pagamento contabil nas fontes de origem.
  -- Se o dinheiro entra na Carteira, as fontes originais cedem a disponibilidade.
  IF v_principal>0 THEN
    UPDATE public.fontes SET balance=round(balance-v_principal,2)
      WHERE id=p_principal_source AND profile_id=p_profile;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte original de capital nao encontrada.'; END IF;
  END IF;
  IF v_profit>0 THEN
    IF p_profit_source IS NOT NULL THEN
      UPDATE public.fontes SET balance=round(balance-v_profit,2)
        WHERE id=p_profit_source AND profile_id=p_profile;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de lucro original nao encontrada.'; END IF;
    ELSE
      UPDATE public.perfis SET interest_balance=round(coalesce(interest_balance,0)-v_profit,2)
        WHERE id=p_profile;
      IF NOT FOUND THEN RAISE EXCEPTION 'Saldo de lucro do perfil nao encontrado.'; END IF;
    END IF;
  END IF;
  -- Apenas uma fonte vinculada recebe a DISPONIBILIDADE total.
  -- Se nao houver vinculo, o valor vai so a conta fisica selecionada.
  IF v_target IS NOT NULL THEN
    UPDATE public.fontes SET balance=round(balance+v_amount,2)
      WHERE id=v_target AND profile_id=p_profile;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte vinculada nao encontrada.'; END IF;
  END IF;
  UPDATE public.personal_wallet_accounts SET
    balance=round(coalesce(balance,0)+v_amount,2),updated_at=now()
    WHERE id=v_account.id AND owner_user_id=v_route.owner_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta selecionada nao recebeu o deposito.'; END IF;
  SELECT nullif(btrim(debtor_name),'') INTO v_client
    FROM public.contratos WHERE id=p_loan;
  INSERT INTO public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at,contract_id,installment_id
  ) VALUES(
    v_route.owner_user_id,p_key,'RECEIPT',NULL,v_account.id,v_amount,
    left('Recebimento de contrato' ||
      CASE WHEN v_client IS NULL THEN '' ELSE ' · '||v_client END,240),
    'Recebimento de contrato',p_payment_date,
    coalesce(p_payment_date,current_date)::timestamptz,p_loan,p_installment
  ) ON CONFLICT(owner_user_id,request_id) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN
    RAISE EXCEPTION 'Recebimento duplicado na Carteira; transacao desfeita.';
  END IF;
  UPDATE public.wallet_receipt_destinations SET
    applied_at=now(),applied_kind=p_kind,applied_amount=v_amount,
    principal_paid=v_principal,interest_paid=v_interest,late_fee_paid=v_late,
    principal_source_id=p_principal_source,profit_source_id=p_profit_source,
    routed_source_id=v_target
    WHERE idempotency_key=p_key;
END $fn$;
REVOKE ALL ON FUNCTION public.wallet_route_receipt_internal(
  uuid,uuid,uuid,uuid,numeric,numeric,numeric,numeric,uuid,uuid,date,text
) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wallet_apply_receipt_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
BEGIN
  IF new.status='COMPLETED' AND new.operation_type<>'REVERSAL'
    AND new.original_operation_id IS NULL THEN
    PERFORM public.wallet_route_receipt_internal(
      new.idempotency_key,new.loan_id,new.installment_id,new.profile_id,
      new.amount_received,new.principal_paid,new.interest_paid,new.late_fee_paid,
      new.source_id,new.profit_source_id,new.payment_date,'V4');
    UPDATE public.financial_operations SET
      wallet_destination_account_id=(
        SELECT account_id FROM public.wallet_receipt_destinations
          WHERE idempotency_key=new.idempotency_key AND applied_at IS NOT NULL)
      WHERE operation_id=new.operation_id
        AND EXISTS(SELECT 1 FROM public.wallet_receipt_destinations
          WHERE idempotency_key=new.idempotency_key AND applied_at IS NOT NULL);
  END IF;
  RETURN new;
END $fn$;
REVOKE ALL ON FUNCTION public.wallet_apply_receipt_destination()
  FROM PUBLIC,anon,authenticated;

-- Condicoes especiais usam V3: o historico e gravado na mesma transacao,
-- e o lancamento real de principal/juros fica nas transacoes da operacao.
CREATE OR REPLACE FUNCTION public.wallet_apply_offer_receipt_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
DECLARE v_total numeric; v_principal numeric; v_interest numeric; v_late numeric;
  v_principal_source uuid;v_profit_source uuid;v_payment_date date;
BEGIN
  IF new.action NOT IN ('USED','PARTIAL') OR new.payment_id IS NULL OR
     NOT EXISTS(SELECT 1 FROM public.wallet_receipt_destinations
       WHERE idempotency_key=new.payment_id) THEN RETURN new; END IF;
  SELECT round(coalesce(sum(amount),0),2),
    round(coalesce(sum(principal_delta),0),2),
    round(coalesce(sum(interest_delta),0),2),
    round(coalesce(sum(late_fee_delta),0),2),
    max(source_id) FILTER(WHERE category='PAGAMENTO'),
    max(source_id) FILTER(WHERE category='LUCRO'),max(date)::date
  INTO v_total,v_principal,v_interest,v_late,v_principal_source,v_profit_source,v_payment_date
  FROM public.transacoes
  WHERE profile_id=new.profile_id AND loan_id=new.loan_id
    AND installment_id=new.installment_id
    AND idempotency_key IN(new.payment_id::text,new.payment_id::text||'_lucro')
    AND category IN ('PAGAMENTO','LUCRO');
  IF v_total<=0 OR abs(v_total-v_principal-v_interest-v_late)>0.02 THEN
    RAISE EXCEPTION 'Condicao especial nao conciliada com o historico financeiro.';
  END IF;
  PERFORM public.wallet_route_receipt_internal(
    new.payment_id,new.loan_id,new.installment_id,new.profile_id,
    v_total,v_principal,v_interest,v_late,v_principal_source,
    v_profit_source,coalesce(v_payment_date,new.agreed_date,current_date),'OFFER');
  RETURN new;
END $fn$;
REVOKE ALL ON FUNCTION public.wallet_apply_offer_receipt_destination()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_wallet_apply_offer_receipt_destination
  ON public.installment_payment_offer_history;
CREATE CONSTRAINT TRIGGER trg_wallet_apply_offer_receipt_destination
AFTER INSERT ON public.installment_payment_offer_history
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.wallet_apply_offer_receipt_destination();

-- Estorno V4 de entrada em conta: reverte a disponibilidade fisica e
-- reconstitui temporariamente as fontes originais antes do estorno canonico.
CREATE OR REPLACE FUNCTION public.wallet_guard_routed_receipt_reversal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
BEGIN
  IF old.status='COMPLETED' AND new.status='REVERSED'
    AND EXISTS(SELECT 1 FROM public.wallet_receipt_destinations d
      WHERE d.idempotency_key=old.idempotency_key
        AND d.applied_at IS NOT NULL AND d.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Use o estorno financeiro integrado a Minha Carteira.';
  END IF;
  RETURN new;
END $fn$;
REVOKE ALL ON FUNCTION public.wallet_guard_routed_receipt_reversal()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_wallet_guard_routed_receipt_reversal
  ON public.financial_operations;
CREATE TRIGGER trg_wallet_guard_routed_receipt_reversal
BEFORE UPDATE OF status ON public.financial_operations
FOR EACH ROW EXECUTE FUNCTION public.wallet_guard_routed_receipt_reversal();

CREATE OR REPLACE FUNCTION public.reverse_wallet_financial_operation_v4(
  p_original_idempotency_key uuid,p_reversal_idempotency_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,extensions,pg_temp AS $fn$
DECLARE v_route public.wallet_receipt_destinations%rowtype;
  v_original public.financial_operations%rowtype;
  v_account public.personal_wallet_accounts%rowtype;
  v_profit numeric(14,2);v_rows integer;
BEGIN
  IF p_original_idempotency_key IS NULL OR p_reversal_idempotency_key IS NULL
    OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Identificadores e motivo de estorno obrigatorios.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_original_idempotency_key::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_reversal_idempotency_key::text,0));
  SELECT * INTO v_original FROM public.financial_operations
    WHERE idempotency_key=p_original_idempotency_key FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.reverse_financial_operation_v4(
      p_original_idempotency_key,p_reversal_idempotency_key,p_reason);
  END IF;
  IF NOT private.financial_actor_can_access(v_original.profile_id) THEN
    RAISE EXCEPTION 'Sem autorizacao para estornar este contrato.';
  END IF;
  SELECT * INTO v_route FROM public.wallet_receipt_destinations
    WHERE idempotency_key=p_original_idempotency_key FOR UPDATE;
  IF NOT FOUND OR v_route.applied_at IS NULL OR
    v_original.status='REVERSED' THEN
    RETURN public.reverse_financial_operation_v4(
      p_original_idempotency_key,p_reversal_idempotency_key,p_reason);
  END IF;
  IF v_route.applied_kind<>'V4' THEN
    RAISE EXCEPTION 'Estorno de condicao especial requer conciliacao juridico-financeira.';
  END IF;
  IF v_route.reversed_at IS NOT NULL OR auth.uid() IS DISTINCT FROM v_route.owner_user_id
    OR NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Estorno ja realizado ou sem autorizacao.';
  END IF;
  SELECT * INTO v_account FROM public.personal_wallet_accounts
    WHERE id=v_route.account_id AND owner_user_id=v_route.owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta original nao encontrada.'; END IF;
  IF round(coalesce(v_account.balance,0),2)<v_route.applied_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta de destino para estorno.';
  END IF;
  IF v_route.routed_source_id IS NOT NULL AND
    v_account.capital_source_id IS NOT NULL AND
    v_account.capital_source_id<>v_route.routed_source_id THEN
    RAISE EXCEPTION 'Vinculo da conta alterado: concilie antes de estornar.';
  END IF;
  IF v_route.routed_source_id IS NOT NULL AND
    v_account.capital_source_id IS NOT NULL AND
    (SELECT round(balance,2) FROM public.fontes
       WHERE id=v_route.routed_source_id) IS DISTINCT FROM
      round(v_account.balance,2) THEN
    RAISE EXCEPTION 'Espelho da conta divergente, estorno bloqueado.';
  END IF;
  UPDATE public.personal_wallet_accounts
    SET balance=round(balance-v_route.applied_amount,2),updated_at=now()
    WHERE id=v_route.account_id AND owner_user_id=v_route.owner_user_id;
  IF v_route.routed_source_id IS NOT NULL AND
    v_account.capital_source_id IS DISTINCT FROM v_route.routed_source_id THEN
    UPDATE public.fontes SET balance=round(balance-v_route.applied_amount,2)
      WHERE id=v_route.routed_source_id AND profile_id=v_original.profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte vinculada de destino nao encontrada.'; END IF;
  END IF;
  IF v_route.principal_paid>0 THEN
    UPDATE public.fontes SET balance=round(balance+v_route.principal_paid,2)
      WHERE id=v_route.principal_source_id AND profile_id=v_original.profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte principal do contrato nao encontrada.'; END IF;
  END IF;
  v_profit:=round(coalesce(v_route.interest_paid,0)+coalesce(v_route.late_fee_paid,0),2);
  IF v_profit>0 THEN
    IF v_route.profit_source_id IS NOT NULL THEN
      UPDATE public.fontes SET balance=round(balance+v_profit,2)
        WHERE id=v_route.profit_source_id AND profile_id=v_original.profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fonte original do lucro nao encontrada.'; END IF;
    ELSE
      UPDATE public.perfis SET interest_balance=round(coalesce(interest_balance,0)+v_profit,2)
        WHERE id=v_original.profile_id;
    END IF;
  END IF;
  INSERT INTO public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at,contract_id,installment_id
  ) VALUES(
    v_route.owner_user_id,p_reversal_idempotency_key,'PAYMENT',v_route.account_id,NULL,
    v_route.applied_amount,left('Estorno de recebimento · '||p_reason,240),
    'Estorno de recebimento',current_date,now(),v_original.loan_id,v_original.installment_id
  ) ON CONFLICT(owner_user_id,request_id) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Chave de estorno ja utilizada na Carteira.'; END IF;
  UPDATE public.wallet_receipt_destinations SET reversed_at=now(),
    reversal_idempotency_key=p_reversal_idempotency_key
    WHERE idempotency_key=p_original_idempotency_key;
  RETURN public.reverse_financial_operation_v4(
    p_original_idempotency_key,p_reversal_idempotency_key,p_reason);
END $fn$;
REVOKE ALL ON FUNCTION public.reverse_wallet_financial_operation_v4(uuid,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_wallet_financial_operation_v4(uuid,uuid,text)
  TO authenticated;

-- Saque do Balanco para conta selecionada. Sem destino o frontend chama a
-- rotina V2 anterior, mantendo exatamente o comportamento legado.
CREATE OR REPLACE FUNCTION public.withdraw_profit_to_wallet_atomic(
  p_idempotency_key uuid,p_amount numeric,p_profile_id uuid,
  p_source_id uuid,p_account_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,extensions,pg_temp AS $fn$
DECLARE v_account public.personal_wallet_accounts%rowtype;
  v_target uuid; v_reference uuid; v_balance numeric; v_result jsonb;
  v_record public.transacoes%rowtype; v_movement record;v_rows integer;
  v_amount numeric(14,2):=round(coalesce(p_amount,0),2);
BEGIN
  IF p_idempotency_key IS NULL OR p_profile_id IS NULL OR p_account_id IS NULL
    OR v_amount<=0 OR auth.uid() IS NULL OR NOT public.is_platform_super_admin()
    OR NOT EXISTS(SELECT 1 FROM public.perfis
      WHERE id=p_profile_id AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Destino de saque nao autorizado ou valor invalido.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  SELECT * INTO v_account FROM public.personal_wallet_accounts
    WHERE id=p_account_id AND owner_user_id=auth.uid() AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de saque indisponivel.'; END IF;
  SELECT source_id INTO v_reference FROM public.capital_source_wallet_references
    WHERE owner_user_id=auth.uid() AND target_kind='ACCOUNT'
      AND target_id=v_account.id;
  IF v_reference IS NOT NULL AND v_account.capital_source_id IS NOT NULL
    AND v_reference<>v_account.capital_source_id THEN
    RAISE EXCEPTION 'Conta com vinculos de Capital conflitantes.';
  END IF;
  v_target:=coalesce(v_account.capital_source_id,v_reference);
  IF v_target IS NOT NULL THEN
    IF v_target=p_source_id THEN
      RAISE EXCEPTION 'Conta vinculada a mesma fonte de lucro. Selecione outra conta para evitar saldo duplicado.';
    END IF;
    SELECT balance INTO v_balance FROM public.fontes
      WHERE id=v_target AND profile_id=p_profile_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fonte vinculada ao saque nao encontrada.'; END IF;
    IF v_account.capital_source_id IS NOT NULL AND
      round(v_balance,2) IS DISTINCT FROM round(v_account.balance,2) THEN
      RAISE EXCEPTION 'Saldo da fonte e da conta divergente: concilie antes do saque.';
    END IF;
  END IF;
  SELECT * INTO v_record FROM public.transacoes
    WHERE profile_id=p_profile_id AND idempotency_key=p_idempotency_key::text FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_movement FROM public.personal_wallet_account_operations
      WHERE owner_user_id=auth.uid() AND request_id=p_idempotency_key
      AND to_account_id=p_account_id AND operation_type='INCOME'
      AND round(amount,2)=v_amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Chave de saque vinculada a destino diferente.'; END IF;
    RETURN coalesce(v_record.meta->'result','{}'::jsonb) ||
      jsonb_build_object('success',true,'idempotent_replay',true);
  END IF;
  v_result:=public.withdraw_profit_atomic_v2(
    p_idempotency_key,v_amount,p_profile_id,p_source_id,v_target);
  UPDATE public.personal_wallet_accounts
    SET balance=round(coalesce(balance,0)+v_amount,2),updated_at=now()
    WHERE id=v_account.id AND owner_user_id=auth.uid();
  INSERT INTO public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at
  ) VALUES(auth.uid(),p_idempotency_key,'INCOME',NULL,v_account.id,
    v_amount,'Resgate de lucro do Balanco','Resgate de lucro',current_date,now())
  ON CONFLICT(owner_user_id,request_id) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Chave de saque duplicada.'; END IF;
  UPDATE public.transacoes SET
    meta=coalesce(meta,'{}'::jsonb) || jsonb_build_object(
      'wallet_destination_account_id',p_account_id,
      'wallet_destination_source_id',v_target,
      'receipt_total',v_amount,
      'result',v_result || jsonb_build_object('wallet_destination_account_id',p_account_id))
    WHERE profile_id=p_profile_id AND idempotency_key=p_idempotency_key::text
      AND type='PROFIT_WITHDRAWAL';
  RETURN v_result || jsonb_build_object('wallet_destination_account_id',p_account_id);
END $fn$;
REVOKE ALL ON FUNCTION public.withdraw_profit_to_wallet_atomic(uuid,numeric,uuid,uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.withdraw_profit_to_wallet_atomic(uuid,numeric,uuid,uuid,uuid)
  TO authenticated;

NOTIFY pgrst,'reload schema';
