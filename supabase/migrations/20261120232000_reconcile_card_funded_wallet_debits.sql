-- Corrige débito duplicado na conta bancária para dois contratos financiados por cartão.
-- Não exclui operações originais, contratos, faturas ou despesas no cartão.
-- Toda a migração é transacional: pré-condições divergentes provocam ROLLBACK.
CREATE OR REPLACE FUNCTION public.trg_sync_transacao_to_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner_user_id uuid;
  v_account_id uuid;
  v_balance numeric(14,2);
  v_request_id uuid;
  v_debtor_name text;
  v_parcela_num integer;
  v_desc text;
  v_op_date date;
begin
  -- Apenas opera se houver fonte e valor positivo
  if new.source_id is null or new.amount is null or new.amount <= 0 then
    return new;
  end if;

  -- Somente tipos financeiros pertinentes da operacao
  if new.type not in ('LOAN_INITIAL', 'PAYMENT_RECEIVED') then
    return new;
  end if;
  -- Proteção executada antes de criar qualquer lançamento ou debitar saldos.
  -- Não depende da despesa do cartão já existir neste instante.
  if new.type = 'LOAN_INITIAL' and (
    coalesce(new.meta->>'source_balance_effect','') = 'NONE'
    or coalesce(new.meta->>'funding_origin','') = 'CREDIT_CARD'
    or exists (
      select 1 from public.contratos c
      join public.fontes f on f.id=c.source_id
      where c.id=new.loan_id and c.source_id=new.source_id
        and c.funding_payment_method='CREDIT_CARD'
        and f.type in ('CARD','MISTO')
    )
  ) then
    return new;
  end if;


  -- Resolve o owner_user_id atraves do profile_id da transacao
  select coalesce(p.user_id, p.id) into v_owner_user_id
  from public.perfis p
  where p.id = new.profile_id;

  if v_owner_user_id is null then
    return new;
  end if;

  -- Isolamento estrito: se o usuario nao tiver permissao/feature flag da Carteira, nao faz nada
  if not public.is_wallet_integration_enabled(v_owner_user_id) then
    return new;
  end if;

  -- Serializa a operacao pelo usuario para evitar concorrencia
  perform pg_advisory_xact_lock(hashtextextended(v_owner_user_id::text, 19283));

  -- Verifica se a fonte de capital da transacao esta vinculada a uma conta da Carteira (trava pessimista FOR UPDATE)
  select a.id, a.balance into v_account_id, v_balance
  from public.personal_wallet_accounts a
  where a.owner_user_id = v_owner_user_id
    and a.capital_source_id = new.source_id
  for update;

  -- Se a fonte nao estiver vinculada a nenhuma conta da Carteira, sai normalmente
  if v_account_id is null then
    return new;
  end if;

  -- Idempotencia deterministica via hash unico da transacao
  v_request_id := md5('wallet_sync_tx:' || new.id::text)::uuid;
  if exists (
    select 1 from public.personal_wallet_account_operations
    where owner_user_id = v_owner_user_id and request_id = v_request_id
  ) then
    return new;
  end if;

  v_op_date := coalesce((new.date at time zone 'America/Manaus')::date, current_date);

  -- 2. Concessao de Emprestimo (LOAN_INITIAL): debito na conta da Carteira
  if new.type = 'LOAN_INITIAL' then
    select coalesce(nullif(btrim(c.debtor_name), ''), 'Cliente')
    into v_debtor_name
    from public.contratos c
    where c.id = new.loan_id;

    v_desc := 'Empréstimo · ' || coalesce(v_debtor_name, 'Contrato');
    if char_length(v_desc) > 240 then
      v_desc := substring(v_desc from 1 for 240);
    end if;

    if coalesce(v_balance, 0) < new.amount then
      raise exception 'Saldo insuficiente na conta da Carteira para liberar este empréstimo.';
    end if;

    -- Atualiza o saldo bancario na Carteira
    update public.personal_wallet_accounts
    set balance = round(balance - new.amount, 2),
        updated_at = now()
    where id = v_account_id and owner_user_id = v_owner_user_id;

    -- Registra saida no ledger
    insert into public.personal_wallet_account_operations (
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, contract_id, occurred_at
    ) values (
      v_owner_user_id, v_request_id, 'LOAN_DISBURSEMENT', v_account_id, null,
      round(new.amount, 2), v_desc, 'Empréstimo concedido', v_op_date, new.loan_id, coalesce(new.created_at, now())
    );

  -- 3. Liquidacao de Parcela / Recebimento (PAYMENT_RECEIVED): credito na conta da Carteira
  elsif new.type = 'PAYMENT_RECEIVED' then
    select coalesce(nullif(btrim(c.debtor_name), ''), 'Cliente'), p.numero_parcela
    into v_debtor_name, v_parcela_num
    from public.contratos c
    left join public.parcelas p on p.id = new.installment_id
    where c.id = new.loan_id;

    if v_parcela_num is not null then
      v_desc := 'Parcela ' || v_parcela_num::text || ' recebida · ' || coalesce(v_debtor_name, 'Cliente');
    else
      v_desc := 'Recebimento de contrato · ' || coalesce(v_debtor_name, 'Cliente');
    end if;

    if char_length(v_desc) > 240 then
      v_desc := substring(v_desc from 1 for 240);
    end if;

    -- Atualiza o saldo bancario na Carteira
    update public.personal_wallet_accounts
    set balance = round(balance + new.amount, 2),
        updated_at = now()
    where id = v_account_id and owner_user_id = v_owner_user_id;

    -- Registra entrada no ledger
    insert into public.personal_wallet_account_operations (
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, contract_id, installment_id, occurred_at
    ) values (
      v_owner_user_id, v_request_id, 'LOAN_REPAYMENT', null, v_account_id,
      round(new.amount, 2), v_desc, 'Parcela recebida', v_op_date, new.loan_id, new.installment_id, coalesce(new.created_at, now())
    );
  end if;

  return new;
end;
$function$
;

ALTER TABLE public.loan_card_wallet_charges
  ADD COLUMN IF NOT EXISTS source_balance_effect text;
ALTER TABLE public.loan_card_wallet_charges
  ADD COLUMN IF NOT EXISTS source_balance_correction_tx_id uuid
  REFERENCES public.transacoes(id);

CREATE TABLE IF NOT EXISTS public.personal_wallet_card_funding_reconciliations (
  loan_id uuid PRIMARY KEY REFERENCES public.contratos(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.personal_wallet_accounts(id) ON DELETE RESTRICT,
  original_wallet_operation_id uuid NOT NULL UNIQUE
    REFERENCES public.personal_wallet_account_operations(id) ON DELETE RESTRICT,
  reversal_wallet_operation_id uuid NOT NULL UNIQUE
    REFERENCES public.personal_wallet_account_operations(id) ON DELETE RESTRICT,
  original_ledger_transaction_id uuid NOT NULL UNIQUE
    REFERENCES public.transacoes(id) ON DELETE RESTRICT,
  correction_ledger_transaction_id uuid NOT NULL UNIQUE
    REFERENCES public.transacoes(id) ON DELETE RESTRICT,
  restored_amount numeric(14,2) NOT NULL CHECK (restored_amount>0),
  balance_before numeric(14,2) NOT NULL,
  balance_after numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.personal_wallet_card_funding_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_wallet_card_funding_reconciliations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.personal_wallet_card_funding_reconciliations TO authenticated;
DROP POLICY IF EXISTS wallet_card_funding_reconciliation_owner_read
  ON public.personal_wallet_card_funding_reconciliations;
CREATE POLICY wallet_card_funding_reconciliation_owner_read
ON public.personal_wallet_card_funding_reconciliations
FOR SELECT TO authenticated
USING(owner_user_id=(SELECT auth.uid()) AND (SELECT public.can_access_personal_wallet()));

-- Marca o estorno anterior de R$ 700,00 sem o executar novamente.
UPDATE public.loan_card_wallet_charges l
SET source_balance_effect='REVERSED',
    source_balance_correction_tx_id=t.id
FROM public.transacoes t
WHERE t.loan_id=l.loan_id
  AND t.type='ADJUSTMENT'
  AND t.meta->>'operation'='CARD_FUNDED_SOURCE_BALANCE_CORRECTION'
  AND t.reversed_of_transaction_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.personal_wallet_account_operations o
    WHERE o.owner_user_id=l.owner_user_id AND o.contract_id=l.loan_id
      AND o.operation_type='INCOME' AND o.category='Auditoria'
      AND o.request_id=md5('card-source-wallet-restore:'||l.loan_id::text)::uuid
  )
  AND l.source_balance_effect IS NULL;

DO $repair$
DECLARE
 v record;
 v_count integer;
 v_total numeric(14,2);
 v_distinct integer;
 v_balance numeric(14,2);
 v_source_balance numeric(14,2);
 v_source_id uuid;
 v_correction_tx uuid;
 v_reversal_id uuid;
BEGIN
  -- Obtém o mesmo bloqueio usado no gatilho que sincroniza as transações.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (SELECT DISTINCT op.owner_user_id::text
     FROM public.personal_wallet_account_operations op
     JOIN public.personal_wallet_accounts a ON a.id=op.from_account_id
     WHERE a.nickname='Nubank'
       AND op.operation_date=DATE '2026-11-17' AND op.amount=200
       AND op.operation_type='LOAN_DISBURSEMENT'
       AND op.owner_user_id IN
         (SELECT owner_user_id FROM public.capital_source_wallet_origin_access)
     LIMIT 1), 19283));

  SELECT count(*),coalesce(sum(op.amount),0),count(DISTINCT op.contract_id)
  INTO v_count,v_total,v_distinct
  FROM public.personal_wallet_account_operations op
  JOIN public.personal_wallet_accounts a ON a.id=op.from_account_id AND a.owner_user_id=op.owner_user_id
  JOIN public.contratos c ON c.id=op.contract_id
  JOIN public.fontes f ON f.id=c.source_id
  JOIN public.loan_card_wallet_charges l ON l.loan_id=c.id AND l.owner_user_id=op.owner_user_id
  JOIN public.personal_wallet_expenses e ON e.id=l.expense_id AND e.owner_user_id=l.owner_user_id
  JOIN public.transacoes original ON original.loan_id=c.id AND original.type='LOAN_INITIAL'
    AND original.source_id=c.source_id AND original.amount=op.amount
    AND op.request_id=md5('wallet_sync_tx:'||original.id::text)::uuid
  WHERE op.operation_date=DATE '2026-11-17' AND op.amount=200
    AND op.operation_type='LOAN_DISBURSEMENT'
    AND op.voided_at IS NULL
    AND op.owner_user_id IN (SELECT owner_user_id FROM public.capital_source_wallet_origin_access)
    AND a.nickname='Nubank' AND a.capital_source_id=c.source_id
    AND c.funding_payment_method='CREDIT_CARD'
    AND f.type='CARD' AND e.account_id IS NULL
    AND op.to_account_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.personal_wallet_account_operations audit
      WHERE audit.owner_user_id=op.owner_user_id
        AND audit.request_id=md5('card-source-wallet-restore:'||op.contract_id::text)::uuid
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.transacoes t
      WHERE t.reversed_of_transaction_id=original.id
        OR t.idempotency_key=op.contract_id::text||':card-source-correction'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.personal_wallet_card_funding_reconciliations rec
      WHERE rec.loan_id=op.contract_id
    );

  -- Ambiente novo ou migração já aplicada: não há nada a reparar.
  -- Se apenas parte dos registros persistiu, o erro abaixo impede ajuste parcial.
  IF v_count=0 THEN
    RETURN;
  END IF;
  IF v_count<>2 OR v_total<>400 OR v_distinct<>2 THEN
    RAISE EXCEPTION 'Reconciliação não aplicada: esperado exatamente 2 débitos de cartão de R$ 200,00, encontrados % (total %).',
      v_count,v_total;
  END IF;

  FOR v IN
    SELECT op.*,c.owner_id AS profile_id,c.source_id,
      original.id AS original_tx_id
    FROM public.personal_wallet_account_operations op
    JOIN public.personal_wallet_accounts a ON a.id=op.from_account_id AND a.owner_user_id=op.owner_user_id
    JOIN public.contratos c ON c.id=op.contract_id
    JOIN public.fontes f ON f.id=c.source_id
    JOIN public.loan_card_wallet_charges l ON l.loan_id=c.id AND l.owner_user_id=op.owner_user_id
    JOIN public.personal_wallet_expenses e ON e.id=l.expense_id AND e.owner_user_id=l.owner_user_id
    JOIN public.transacoes original ON original.loan_id=c.id AND original.type='LOAN_INITIAL'
      AND original.source_id=c.source_id AND original.amount=op.amount
      AND op.request_id=md5('wallet_sync_tx:'||original.id::text)::uuid
    WHERE op.operation_date=DATE '2026-11-17' AND op.amount=200
      AND op.operation_type='LOAN_DISBURSEMENT' AND op.voided_at IS NULL
      AND op.owner_user_id IN (SELECT owner_user_id FROM public.capital_source_wallet_origin_access)
      AND a.nickname='Nubank' AND a.capital_source_id=c.source_id
      AND c.funding_payment_method='CREDIT_CARD' AND f.type='CARD'
      AND e.account_id IS NULL AND op.to_account_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.personal_wallet_account_operations audit
        WHERE audit.owner_user_id=op.owner_user_id
          AND audit.request_id=md5('card-source-wallet-restore:'||op.contract_id::text)::uuid
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.transacoes t
        WHERE t.reversed_of_transaction_id=original.id
          OR t.idempotency_key=op.contract_id::text||':card-source-correction'
      )
      AND NOT EXISTS(
        SELECT 1 FROM public.personal_wallet_card_funding_reconciliations rec
        WHERE rec.loan_id=op.contract_id
      )
    ORDER BY op.created_at,op.id
    FOR UPDATE OF op
  LOOP
    SELECT a.balance,a.capital_source_id,f.balance
    INTO v_balance,v_source_id,v_source_balance
    FROM public.personal_wallet_accounts a
    JOIN public.fontes f ON f.id=a.capital_source_id
    WHERE a.id=v.from_account_id AND a.owner_user_id=v.owner_user_id
    FOR UPDATE OF a,f;
    IF v_source_id IS DISTINCT FROM v.source_id OR
       v_balance IS DISTINCT FROM v_source_balance THEN
      RAISE EXCEPTION 'Saldo de conta/fonte divergente, abortando correção.';
    END IF;

    -- Ledger de correção idempotente e vinculado à transação original.
    v_correction_tx:=gen_random_uuid();
    INSERT INTO public.transacoes(
      id,loan_id,profile_id,source_id,date,type,amount,principal_delta,
      interest_delta,late_fee_delta,category,notes,idempotency_key,
      reversed_of_transaction_id,meta
    ) VALUES (
      v_correction_tx,v.contract_id,v.profile_id,v.source_id,now(),'ADJUSTMENT',0,
      0,0,0,'AUDITORIA',
      'Correção: empréstimo financiado no cartão não debita conta',
      v.contract_id::text||':card-source-correction',
      v.original_tx_id,
      jsonb_build_object(
        'operation','CARD_FUNDED_SOURCE_BALANCE_CORRECTION',
        'restored_amount',v.amount,
        'original_transaction_id',v.original_tx_id,
        'account_correction','2026-11-20'
      )
    );

    -- Reposição real do saldo. Gatilho preexistente mantém a fonte Nu em sincronia
    -- e registra automaticamente a mudança no financial_balance_audit.
    UPDATE public.personal_wallet_accounts
    SET balance=round(balance+v.amount,2),updated_at=now()
    WHERE id=v.from_account_id AND owner_user_id=v.owner_user_id;

    INSERT INTO public.personal_wallet_account_operations(
      owner_user_id,request_id,operation_type,from_account_id,to_account_id,
      amount,description,category,operation_date,contract_id,occurred_at
    ) VALUES(
      v.owner_user_id,
      md5('card-source-wallet-restore:'||v.contract_id::text)::uuid,
      'INCOME',NULL,v.from_account_id,v.amount,
      'Estorno: empréstimo financiado no cartão não debita conta',
      'Auditoria',(now() AT TIME ZONE 'America/Manaus')::date,
      v.contract_id,now()
    ) RETURNING id INTO v_reversal_id;

    UPDATE public.loan_card_wallet_charges
    SET source_balance_effect='REVERSED',
        source_balance_correction_tx_id=v_correction_tx
    WHERE loan_id=v.contract_id AND owner_user_id=v.owner_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo de compra no cartão desapareceu.'; END IF;

    INSERT INTO public.personal_wallet_card_funding_reconciliations(
      loan_id,owner_user_id,account_id,original_wallet_operation_id,
      reversal_wallet_operation_id,original_ledger_transaction_id,
      correction_ledger_transaction_id,restored_amount,balance_before,balance_after
    ) VALUES (
      v.contract_id,v.owner_user_id,v.from_account_id,v.id,
      v_reversal_id,v.original_tx_id,v_correction_tx,v.amount,
      v_balance,round(v_balance+v.amount,2)
    );
  END LOOP;
  IF (SELECT count(*) FROM public.personal_wallet_card_funding_reconciliations
      WHERE created_at>=transaction_timestamp()) <> 2 THEN
    RAISE EXCEPTION 'A reconciliação não concluiu dois registros.';
  END IF;
END $repair$;

-- Referência para compatibilidade com migração de financiamento já versionada.
-- Nenhuma despesa ou parcela do cartão foi modificada.
