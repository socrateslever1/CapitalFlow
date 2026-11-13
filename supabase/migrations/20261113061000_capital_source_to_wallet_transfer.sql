-- Transferência CONTÁBIL entre fonte de capital e conta da Minha Carteira.
-- Nunca inicia PIX/TED externo e nunca cria receita, contrato ou recebimento.
-- Segurança: master autenticado, perfil e conta próprios, saldo e vínculo válidos,
-- travas transacionais, operação auditável e idempotência estrita.

CREATE TABLE IF NOT EXISTS public.capital_source_wallet_transfers (
  request_id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL REFERENCES public.fontes(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.personal_wallet_accounts(id) ON DELETE RESTRICT,
  wallet_operation_id uuid NOT NULL UNIQUE REFERENCES public.personal_wallet_account_operations(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS capital_source_wallet_transfers_owner_idx
  ON public.capital_source_wallet_transfers(owner_user_id, created_at DESC);
ALTER TABLE public.capital_source_wallet_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capital_source_wallet_transfers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.capital_source_wallet_transfers TO service_role;

-- A operação tem tipo próprio. Não é INCOME: não aumenta receita/lucro.
ALTER TABLE public.personal_wallet_account_operations
  DROP CONSTRAINT IF EXISTS personal_wallet_account_operations_operation_type_check;
ALTER TABLE public.personal_wallet_account_operations
  ADD CONSTRAINT personal_wallet_account_operations_operation_type_check
  CHECK (operation_type = ANY(ARRAY[
    'INCOME','RECEIPT','EXPENSE','PAYMENT','TRANSFER','EXTERNAL_TRANSFER',
    'LOAN_DISBURSEMENT','LOAN_REPAYMENT','CAPITAL_TRANSFER'
  ]));
ALTER TABLE public.personal_wallet_account_operations
  DROP CONSTRAINT IF EXISTS personal_wallet_operation_accounts_match;
ALTER TABLE public.personal_wallet_account_operations
  ADD CONSTRAINT personal_wallet_operation_accounts_match
  CHECK (
    (operation_type IN ('INCOME','RECEIPT','LOAN_REPAYMENT','CAPITAL_TRANSFER')
      AND from_account_id IS NULL AND to_account_id IS NOT NULL)
    OR (operation_type IN ('EXPENSE','PAYMENT','EXTERNAL_TRANSFER','LOAN_DISBURSEMENT')
      AND from_account_id IS NOT NULL AND to_account_id IS NULL)
    OR (operation_type='TRANSFER' AND from_account_id IS NOT NULL
      AND to_account_id IS NOT NULL AND from_account_id <> to_account_id)
  );

CREATE OR REPLACE FUNCTION public.capital_source_transfer_to_wallet(
  p_profile_id uuid,
  p_source_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_source public.fontes%ROWTYPE;
  v_account public.personal_wallet_accounts%ROWTYPE;
  v_mirror public.fontes%ROWTYPE;
  v_old public.capital_source_wallet_transfers%ROWTYPE;
  v_operation_id uuid;
  v_amount numeric(14,2);
  v_day date := (now() AT TIME ZONE 'America/Manaus')::date;
BEGIN
  IF v_owner IS NULL OR NOT public.is_platform_super_admin()
      OR p_request_id IS NULL OR p_profile_id IS NULL
      OR p_source_id IS NULL OR p_account_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.perfis p
         WHERE p.id=p_profile_id AND p.user_id=v_owner
      ) THEN
    RAISE EXCEPTION 'Movimentação não autorizada para este perfil.';
  END IF;
  IF p_amount IS NULL OR p_amount<=0 OR p_amount>999999999999.99
       OR p_amount<>round(p_amount,2) THEN
    RAISE EXCEPTION 'Informe um valor positivo com até duas casas decimais.';
  END IF;
  v_amount := round(p_amount,2);

  -- Serializa com operações existentes da mesma Carteira e impede dupla confirmação.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text,18273));
  SELECT * INTO v_old FROM public.capital_source_wallet_transfers
    WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_old.owner_user_id IS DISTINCT FROM v_owner
       OR v_old.profile_id IS DISTINCT FROM p_profile_id
       OR v_old.source_id IS DISTINCT FROM p_source_id
       OR v_old.account_id IS DISTINCT FROM p_account_id
       OR v_old.amount IS DISTINCT FROM v_amount THEN
      RAISE EXCEPTION 'Identificador de transferência reutilizado para dados diferentes.';
    END IF;
    RETURN jsonb_build_object('operation_id',v_old.wallet_operation_id,
      'amount',v_old.amount,'idempotent_replay',true);
  END IF;

  -- A conta é bloqueada primeiro, alinhando a ordem com a Carteira.
  SELECT * INTO v_account FROM public.personal_wallet_accounts
    WHERE id=p_account_id AND owner_user_id=v_owner
      AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de destino indisponível.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.personal_wallet_reset_archives a
     WHERE a.owner_user_id=v_owner AND a.restored_at IS NULL
       AND coalesce(a.hidden_ids->'accounts','[]'::jsonb)
           @> jsonb_build_array(p_account_id::text)
  ) THEN
    RAISE EXCEPTION 'Conta antiga, oculta pelo reinício da Carteira, não é destino permitido.';
  END IF;

  SELECT * INTO v_source FROM public.fontes
    WHERE id=p_source_id AND profile_id=p_profile_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de capital indisponível neste perfil.'; END IF;
  IF v_source.type IN ('CARD','MISTO') THEN
    RAISE EXCEPTION 'Limite de cartão não pode ser transferido como dinheiro.';
  END IF;
  IF v_source.balance IS NULL OR v_source.balance < v_amount THEN
    RAISE EXCEPTION 'Saldo operacional insuficiente na fonte selecionada.';
  END IF;
  -- Conta espelho: o saldo da fonte já É o mesmo dinheiro da conta.
  IF v_account.capital_source_id=p_source_id OR EXISTS (
    SELECT 1 FROM public.capital_source_wallet_references r
    WHERE r.owner_user_id=v_owner AND r.source_id=p_source_id
      AND r.target_kind='ACCOUNT' AND r.target_id=p_account_id
  ) THEN
    RAISE EXCEPTION 'A conta já representa esta fonte; não duplique o mesmo saldo.';
  END IF;
  -- Não debitar uma fonte que é espelho de outra conta sem movimentá-la.
  IF EXISTS (
    SELECT 1 FROM public.personal_wallet_accounts a
    WHERE a.capital_source_id=p_source_id AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Esta fonte está espelhada em outra conta. Utilize a transferência entre contas.';
  END IF;
  -- Uma conta ligada a outra fonte exige consistência antes da alteração.
  IF v_account.capital_source_id IS NOT NULL THEN
    SELECT * INTO v_mirror FROM public.fontes
    WHERE id=v_account.capital_source_id AND profile_id=p_profile_id
      AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND OR round(coalesce(v_mirror.balance,0),2)
        IS DISTINCT FROM round(coalesce(v_account.balance,0),2) THEN
      RAISE EXCEPTION 'A conta e sua fonte vinculada têm saldos divergentes.';
    END IF;
  END IF;

  UPDATE public.fontes
    SET balance=round(balance-v_amount,2)
    WHERE id=v_source.id AND profile_id=p_profile_id
      AND balance>=v_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo da fonte mudou durante a transferência.'; END IF;

  UPDATE public.personal_wallet_accounts
    SET balance=round(balance+v_amount,2), updated_at=now()
    WHERE id=v_account.id AND owner_user_id=v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'A conta não recebeu o crédito contábil.'; END IF;

  INSERT INTO public.personal_wallet_account_operations (
    owner_user_id, request_id, operation_type, from_account_id, to_account_id,
    amount, description, category, operation_date, occurred_at
  ) VALUES (
    v_owner, p_request_id, 'CAPITAL_TRANSFER', NULL, v_account.id,
    v_amount, left('Transferência de capital · '||v_source.name,240),
    'Movimentação interna de Capital', v_day, now()
  ) RETURNING id INTO v_operation_id;

  INSERT INTO public.capital_source_wallet_transfers (
    request_id,owner_user_id,profile_id,source_id,account_id,wallet_operation_id,amount
  ) VALUES (
    p_request_id,v_owner,p_profile_id,v_source.id,v_account.id,v_operation_id,v_amount
  );
  RETURN jsonb_build_object('operation_id',v_operation_id,
    'amount',v_amount,'idempotent_replay',false,
    'source_id',v_source.id,'account_id',v_account.id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.capital_source_transfer_to_wallet(uuid,uuid,uuid,numeric,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capital_source_transfer_to_wallet(uuid,uuid,uuid,numeric,uuid)
  TO authenticated;
COMMENT ON FUNCTION public.capital_source_transfer_to_wallet(uuid,uuid,uuid,numeric,uuid) IS
  'Movimentação contábil master entre fonte livre e conta própria, com auditoria, idempotência e proteção de espelhos. Não transfere fundos entre bancos.';
NOTIFY pgrst, 'reload schema';
