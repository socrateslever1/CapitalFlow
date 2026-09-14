-- Normaliza modalidades de amortização legadas para o modelo atual do Mensal/Giro.
-- Contratos MONTHLY antigos com FULL/PRICE/SAC já são operacionalizados pelo motor JUROS;
-- esta migration elimina a divergência de rótulo e impede que ela volte a ser gravada.

CREATE OR REPLACE FUNCTION public.normalize_supported_amortization_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF upper(COALESCE(NEW.billing_cycle, 'MONTHLY')) = 'MONTHLY'
     AND upper(COALESCE(NEW.amortization_type, 'JUROS')) IN ('FULL', 'PRICE', 'SAC')
  THEN
    NEW.amortization_type := 'JUROS';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_supported_amortization_type ON public.contratos;
CREATE TRIGGER trg_normalize_supported_amortization_type
BEFORE INSERT OR UPDATE OF billing_cycle, amortization_type
ON public.contratos
FOR EACH ROW
EXECUTE FUNCTION public.normalize_supported_amortization_type();

UPDATE public.contratos
SET
  amortization_type = 'JUROS',
  policies_snapshot = COALESCE(
    policies_snapshot,
    jsonb_build_object(
      'interestRate', COALESCE(interest_rate, 0),
      'finePercent', COALESCE(fine_percent, 0),
      'dailyInterestPercent', COALESCE(daily_interest_percent, 0)
    )
  )
WHERE upper(COALESCE(billing_cycle, 'MONTHLY')) = 'MONTHLY'
  AND upper(COALESCE(amortization_type, 'JUROS')) IN ('FULL', 'PRICE', 'SAC');

NOTIFY pgrst, 'reload schema';
