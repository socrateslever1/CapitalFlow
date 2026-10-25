-- CapitalFlow V5: reconciliation report, read-only, never updates historical data.
-- Run in a privileged audit session; only aggregate counts are returned.
-- Candidate duplicates are not proof of an incorrect payment.
WITH completed AS (
 SELECT operation_id,operation_type,status,original_operation_id,loan_id,
        COALESCE(amount_received,0)::numeric as amount_received,
        COALESCE(principal_paid,0)::numeric as principal_paid,
        COALESCE(interest_paid,0)::numeric as interest_paid,
        COALESCE(late_fee_paid,0)::numeric as late_fee_paid,
        COALESCE(principal_forgiven,0)::numeric as principal_forgiven,
        COALESCE(interest_forgiven,0)::numeric as interest_forgiven,
        COALESCE(late_fee_forgiven,0)::numeric as late_fee_forgiven
 FROM public.financial_operations
 WHERE status='COMPLETED'
), checks AS (
 SELECT
 count(*) AS operations,
 count(*) FILTER (WHERE operation_type<>'REVERSAL'
   AND (principal_paid < -0.005 OR interest_paid < -0.005 OR late_fee_paid < -0.005
     OR (amount_received > 0 AND principal_paid+interest_paid+late_fee_paid > amount_received+0.01))) AS component_anomalies,
 count(*) FILTER (WHERE operation_type='REVERSAL' AND original_operation_id IS NULL) AS orphan_reversals,
 round(sum(CASE WHEN operation_type<>'REVERSAL' THEN principal_paid ELSE 0 END),2) AS principal_recovered_gross,
 round(sum(CASE WHEN operation_type<>'REVERSAL' THEN interest_paid+late_fee_paid ELSE 0 END),2) AS gross_realized_income_components,
 round(sum(CASE WHEN operation_type<>'REVERSAL'
    THEN principal_forgiven+interest_forgiven+late_fee_forgiven ELSE 0 END),2) AS forgiven_components
 FROM completed
), legacy AS (
 SELECT count(*) AS paid_agreement_installments_without_audit
 FROM public.acordo_parcelas p
 WHERE greatest(coalesce(p.paid_amount,0),coalesce(p.valor_pago,0),0)>0.01
 AND NOT EXISTS(SELECT 1 FROM public.acordo_pagamentos ap WHERE ap.parcela_id=p.id AND ap.reversed_at IS NULL)
), duplicate_candidates AS (
 SELECT count(*) AS cases FROM (
  SELECT ap.acordo_id,ap.parcela_id FROM public.acordo_pagamentos ap
  JOIN public.acordo_parcelas p ON p.id=ap.parcela_id WHERE ap.reversed_at IS NULL
  GROUP BY ap.acordo_id,ap.parcela_id HAVING count(*)>1
   AND sum(coalesce(ap.amount,0))>max(greatest(coalesce(p.paid_amount,0),coalesce(p.valor_pago,0),0))+0.01
 ) x
)
SELECT checks.*,legacy.paid_agreement_installments_without_audit,
 duplicate_candidates.cases AS duplicate_payment_candidates
FROM checks CROSS JOIN legacy CROSS JOIN duplicate_candidates;

-- No private customer data, names, or contract identifiers are returned.
-- Compare with authoritative hard-invariant report.
SELECT private.financial_integrity_report() AS report;
