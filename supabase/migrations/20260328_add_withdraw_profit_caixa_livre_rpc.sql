CREATE OR REPLACE FUNCTION public.withdraw_profit_caixa_livre(
  p_amount NUMERIC,
  p_profile_id UUID,
  p_source_id UUID,
  p_target_source_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source_balance NUMERIC;
  v_target_exists BOOLEAN;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do resgate deve ser maior que zero.';
  END IF;

  SELECT COALESCE(balance, 0)
  INTO v_source_balance
  FROM fontes
  WHERE id = p_source_id
    AND profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fonte Caixa Livre não encontrada para o perfil informado.';
  END IF;

  IF v_source_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na fonte Caixa Livre.';
  END IF;

  IF p_target_source_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM fontes
      WHERE id = p_target_source_id
        AND profile_id = p_profile_id
    )
    INTO v_target_exists;

    IF NOT v_target_exists THEN
      RAISE EXCEPTION 'Fonte de destino não encontrada para o perfil informado.';
    END IF;
  END IF;

  UPDATE fontes
  SET balance = COALESCE(balance, 0) - p_amount
  WHERE id = p_source_id
    AND profile_id = p_profile_id;

  IF p_target_source_id IS NOT NULL THEN
    UPDATE fontes
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = p_target_source_id
      AND profile_id = p_profile_id;
  END IF;
END;
$$;
