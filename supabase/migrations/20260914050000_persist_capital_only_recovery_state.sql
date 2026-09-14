-- Estado persistente e protegido para a condição operacional Somente Capital.

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS capital_only_recovery boolean NOT NULL DEFAULT false;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS capital_only_recovery_policy jsonb;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS capital_only_recovery_updated_at timestamptz;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS capital_only_recovery_updated_by uuid REFERENCES public.perfis(id) ON DELETE SET NULL;

UPDATE public.contratos
SET
  capital_only_recovery = true,
  capital_only_recovery_policy = COALESCE(capital_only_recovery_policy, policies_snapshot),
  capital_only_recovery_updated_at = COALESCE(capital_only_recovery_updated_at, now())
WHERE position('[CAPITAL_ONLY_RECOVERY]' in COALESCE(notes, '')) > 0;

CREATE OR REPLACE FUNCTION public.guard_capital_only_recovery_marker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_marker constant text := '[CAPITAL_ONLY_RECOVERY]';
  v_notes text;
BEGIN
  v_notes := COALESCE(NEW.notes, '');

  IF (
    TG_OP = 'INSERT'
    OR NEW.capital_only_recovery IS NOT DISTINCT FROM OLD.capital_only_recovery
  )
  AND COALESCE(NEW.capital_only_recovery, false) = false
  AND position(v_marker in v_notes) > 0
  THEN
    NEW.capital_only_recovery := true;
  END IF;

  IF COALESCE(NEW.capital_only_recovery, false) THEN
    IF position(v_marker in v_notes) = 0 THEN
      NEW.notes := concat_ws(
        E'\n',
        NULLIF(btrim(v_notes), ''),
        v_marker || ' Somente capital: recuperar apenas o principal, sem juros ou encargos.'
      );
    END IF;
  ELSE
    SELECT COALESCE(string_agg(line, E'\n' ORDER BY ord), '')
    INTO v_notes
    FROM unnest(string_to_array(v_notes, E'\n')) WITH ORDINALITY AS x(line, ord)
    WHERE position(v_marker in line) = 0;

    NEW.notes := NULLIF(btrim(v_notes), '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_capital_only_recovery_marker ON public.contratos;
CREATE TRIGGER trg_guard_capital_only_recovery_marker
BEFORE INSERT OR UPDATE OF notes, capital_only_recovery
ON public.contratos
FOR EACH ROW
EXECUTE FUNCTION public.guard_capital_only_recovery_marker();

CREATE OR REPLACE FUNCTION public.prepare_capital_only_recovery_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.operator_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT p.id
    INTO NEW.operator_id
    FROM public.perfis p
    WHERE p.user_id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_capital_only_recovery_event ON public.transacoes;
CREATE TRIGGER trg_prepare_capital_only_recovery_event
BEFORE INSERT ON public.transacoes
FOR EACH ROW
WHEN (NEW.type IN ('CAPITAL_ONLY_RECOVERY_ENABLED', 'CAPITAL_ONLY_RECOVERY_DISABLED'))
EXECUTE FUNCTION public.prepare_capital_only_recovery_event();

CREATE OR REPLACE FUNCTION public.sync_capital_only_recovery_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.loan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'CAPITAL_ONLY_RECOVERY_ENABLED' THEN
    UPDATE public.contratos
    SET
      capital_only_recovery = true,
      capital_only_recovery_updated_at = COALESCE(NEW.created_at, NEW.date, now()),
      capital_only_recovery_updated_by = NEW.operator_id
    WHERE id = NEW.loan_id;

    UPDATE public.parcelas
    SET
      interest_remaining = 0,
      late_fee_accrued = 0,
      scheduled_interest = 0
    WHERE loan_id = NEW.loan_id
      AND upper(COALESCE(status, '')) NOT IN (
        'RENEGOCIADO', 'CANCELADO', 'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO'
      );
  ELSIF NEW.type = 'CAPITAL_ONLY_RECOVERY_DISABLED' THEN
    UPDATE public.contratos
    SET
      capital_only_recovery = false,
      capital_only_recovery_updated_at = COALESCE(NEW.created_at, NEW.date, now()),
      capital_only_recovery_updated_by = NEW.operator_id
    WHERE id = NEW.loan_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_capital_only_recovery_event ON public.transacoes;
CREATE TRIGGER trg_sync_capital_only_recovery_event
AFTER INSERT ON public.transacoes
FOR EACH ROW
WHEN (NEW.type IN ('CAPITAL_ONLY_RECOVERY_ENABLED', 'CAPITAL_ONLY_RECOVERY_DISABLED'))
EXECUTE FUNCTION public.sync_capital_only_recovery_event();

NOTIFY pgrst, 'reload schema';
