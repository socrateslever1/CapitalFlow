-- READ ONLY: execute in SQL editor with authorized database access.
-- No UPDATE/DELETE, no attempts to infer that repeated installment payments are necessarily duplicates.
-- Return aggregate counts only; investigate row-level evidence under restricted access.
WITH duplicate_candidates AS (
 SELECT ap.acordo_id,ap.parcela_id,COUNT(*) AS payments,
        SUM(COALESCE(ap.amount,0)) AS posted_amount,
        MAX(GREATEST(COALESCE(p.paid_amount,0),COALESCE(p.valor_pago,0),0)) AS installment_paid
 FROM public.acordo_pagamentos ap
 JOIN public.acordo_parcelas p ON p.id=ap.parcela_id
 WHERE ap.reversed_at IS NULL
 GROUP BY ap.acordo_id,ap.parcela_id
 HAVING COUNT(*)>1
    AND SUM(COALESCE(ap.amount,0))
      >MAX(GREATEST(COALESCE(p.paid_amount,0),COALESCE(p.valor_pago,0),0))+0.01
),
missing_audit AS (
 SELECT p.id
 FROM public.acordo_parcelas p
 WHERE GREATEST(COALESCE(p.paid_amount,0),COALESCE(p.valor_pago,0),0)>0.01
 AND NOT EXISTS (
    SELECT 1 FROM public.acordo_pagamentos ap
    WHERE ap.parcela_id=p.id AND ap.reversed_at IS NULL
 )
)
SELECT 'possible_duplicate_agreement_payments' AS finding,
 COUNT(*) AS cases, 'MANUAL_LEDGER_REVIEW' AS disposition FROM duplicate_candidates
UNION ALL
SELECT 'paid_agreement_installments_without_audit',COUNT(*),'MANUAL_LEDGER_REVIEW'
FROM missing_audit;

-- The authoritative zero-tolerance regression report for financial V4.
SELECT private.financial_integrity_report() AS financial_v4_integrity;
