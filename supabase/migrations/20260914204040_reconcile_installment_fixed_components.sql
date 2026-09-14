-- Reconcilia, de forma idempotente, os componentes derivados das parcelas do Parcelado Fixo.
-- O saldo em aberto e a composicao contratual da propria parcela sao a fonte de verdade.
WITH fixed_rows AS (
  SELECT
    p.id,
    round(greatest(coalesce(p.scheduled_principal, 0), 0)::numeric, 2) AS scheduled_principal,
    round(greatest(coalesce(p.principal_remaining, 0), 0)::numeric, 2) AS principal_remaining,
    round(greatest(coalesce(p.scheduled_interest, 0), 0)::numeric, 2) AS scheduled_interest,
    round(greatest(coalesce(p.interest_remaining, 0), 0)::numeric, 2) AS interest_remaining,
    round(greatest(coalesce(p.late_fee_accrued, 0), 0)::numeric, 2) AS late_fee_remaining,
    round(greatest(coalesce(p.paid_late_fee, 0), 0)::numeric, 2) AS paid_late_fee
  FROM public.parcelas p
  JOIN public.contratos c ON c.id = p.loan_id
  WHERE upper(coalesce(c.billing_cycle, '')) = 'INSTALLMENT_FIXED'
), reconciled AS (
  SELECT
    id,
    principal_remaining,
    interest_remaining,
    late_fee_remaining,
    round(greatest(scheduled_principal - principal_remaining, 0)::numeric, 2) AS paid_principal,
    round(greatest(scheduled_interest - interest_remaining, 0)::numeric, 2) AS paid_interest,
    paid_late_fee
  FROM fixed_rows
)
UPDATE public.parcelas p
SET
  principal_remaining = r.principal_remaining,
  interest_remaining = r.interest_remaining,
  late_fee_accrued = r.late_fee_remaining,
  paid_principal = r.paid_principal,
  paid_interest = r.paid_interest,
  paid_late_fee = r.paid_late_fee,
  paid_total = round((r.paid_principal + r.paid_interest + r.paid_late_fee)::numeric, 2),
  status = CASE
    WHEN round((r.principal_remaining + r.interest_remaining + r.late_fee_remaining)::numeric, 2) <= 0.05 THEN 'PAID'
    WHEN round((r.paid_principal + r.paid_interest + r.paid_late_fee)::numeric, 2) > 0.05 THEN 'PARTIAL'
    ELSE 'PENDING'
  END
FROM reconciled r
WHERE p.id = r.id
  AND (
    abs(coalesce(p.principal_remaining, 0) - r.principal_remaining) > 0.005
    OR abs(coalesce(p.interest_remaining, 0) - r.interest_remaining) > 0.005
    OR abs(coalesce(p.late_fee_accrued, 0) - r.late_fee_remaining) > 0.005
    OR abs(coalesce(p.paid_principal, 0) - r.paid_principal) > 0.005
    OR abs(coalesce(p.paid_interest, 0) - r.paid_interest) > 0.005
    OR abs(coalesce(p.paid_late_fee, 0) - r.paid_late_fee) > 0.005
    OR abs(coalesce(p.paid_total, 0) - (r.paid_principal + r.paid_interest + r.paid_late_fee)) > 0.005
    OR upper(coalesce(p.status, '')) IS DISTINCT FROM CASE
      WHEN round((r.principal_remaining + r.interest_remaining + r.late_fee_remaining)::numeric, 2) <= 0.05 THEN 'PAID'
      WHEN round((r.paid_principal + r.paid_interest + r.paid_late_fee)::numeric, 2) > 0.05 THEN 'PARTIAL'
      ELSE 'PENDING'
    END
  );

NOTIFY pgrst, 'reload schema';
