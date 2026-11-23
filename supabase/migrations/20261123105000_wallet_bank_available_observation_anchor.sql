-- A bank credit-limit observation must have its own timestamp.
-- General invoice edits update updated_at but do not change available_limit.
-- Protects bank-projected availability against double deductions and resets.
ALTER TABLE public.personal_wallet_card_invoice_facts
  ADD COLUMN IF NOT EXISTS available_observed_at timestamptz;

-- Backfill ONLY where the original observation and last modification are
-- identical. Other historical updates cannot be attributed reliably to a
-- bank-value confirmation and must not silently shift an accounting anchor.
UPDATE public.personal_wallet_card_invoice_facts
SET available_observed_at = observed_at
WHERE available_limit IS NOT NULL
  AND available_observed_at IS NULL
  AND observed_at IS NOT NULL
  AND updated_at = observed_at;

CREATE OR REPLACE FUNCTION private.wallet_stamp_bank_available_observation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $wallet$
BEGIN
  NEW.available_observed_at :=
    CASE WHEN NEW.available_limit IS NULL THEN NULL ELSE now() END;
  RETURN NEW;
END;
$wallet$;

DROP TRIGGER IF EXISTS wallet_bank_available_observation
  ON public.personal_wallet_card_invoice_facts;

-- UPDATE OF available_limit fires for explicit confirmations, including
-- same-value confirmations. Invoice-only updates do not target this column.
CREATE TRIGGER wallet_bank_available_observation
BEFORE INSERT OR UPDATE OF available_limit
ON public.personal_wallet_card_invoice_facts
FOR EACH ROW EXECUTE FUNCTION private.wallet_stamp_bank_available_observation();

COMMENT ON COLUMN public.personal_wallet_card_invoice_facts.available_observed_at
IS 'Observation time for available_limit only; does not change on invoice-only corrections.';
