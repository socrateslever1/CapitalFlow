-- Garante que cada contrato tenha no maximo um acordo ativo.
-- Mantem o acordo ativo mais recente e cancela os anteriores sem apagar historico.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY loan_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.acordos_inadimplencia
  WHERE status IN ('ATIVO', 'ACTIVE')
)
UPDATE public.acordos_inadimplencia a
SET status = 'CANCELADO',
    updated_at = now()
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE OR REPLACE FUNCTION public.ensure_single_active_agreement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('ATIVO', 'ACTIVE') THEN
    UPDATE public.acordos_inadimplencia
    SET status = 'CANCELADO',
        updated_at = now()
    WHERE loan_id = NEW.loan_id
      AND id <> NEW.id
      AND status IN ('ATIVO', 'ACTIVE');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_agreement ON public.acordos_inadimplencia;

CREATE TRIGGER trg_single_active_agreement
BEFORE INSERT OR UPDATE OF status, loan_id
ON public.acordos_inadimplencia
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_active_agreement();

CREATE UNIQUE INDEX IF NOT EXISTS uq_acordos_inadimplencia_one_active_per_loan
ON public.acordos_inadimplencia (loan_id)
WHERE status IN ('ATIVO', 'ACTIVE');
