-- Production read-only reconciliation. Run with a privileged, read-only
-- audit account; outputs are counts only and expose no personal transactions.
SELECT 'wallet_expense_card_cross_owner' AS invariant, COUNT(*)::bigint AS findings
FROM public.personal_wallet_expenses e JOIN public.personal_wallet_cards c ON c.id=e.card_id
WHERE e.owner_user_id<>c.owner_user_id
UNION ALL SELECT 'wallet_expense_account_cross_owner', COUNT(*) FROM public.personal_wallet_expenses e
JOIN public.personal_wallet_accounts a ON a.id=e.account_id WHERE e.owner_user_id<>a.owner_user_id
UNION ALL SELECT 'wallet_installment_cross_owner', COUNT(*) FROM public.personal_wallet_expense_installments i
JOIN public.personal_wallet_expenses e ON e.id=i.expense_id WHERE i.owner_user_id<>e.owner_user_id
UNION ALL SELECT 'wallet_invoice_payment_cross_owner_card', COUNT(*) FROM public.personal_wallet_invoice_payments p
JOIN public.personal_wallet_cards c ON c.id=p.card_id WHERE p.owner_user_id<>c.owner_user_id
UNION ALL SELECT 'wallet_invoice_payment_cross_owner_account', COUNT(*) FROM public.personal_wallet_invoice_payments p
JOIN public.personal_wallet_accounts a ON a.id=p.account_id WHERE p.owner_user_id<>a.owner_user_id
UNION ALL SELECT 'wallet_invoice_facts_cross_owner', COUNT(*) FROM public.personal_wallet_card_invoice_facts f
JOIN public.personal_wallet_cards c ON c.id=f.card_id WHERE f.owner_user_id<>c.owner_user_id
UNION ALL SELECT 'wallet_installment_overpaid_or_negative', COUNT(*) FROM public.personal_wallet_expense_installments
WHERE paid_amount<0 OR paid_amount>amount
UNION ALL SELECT 'wallet_expense_duplicate_request', COUNT(*) FROM (
SELECT owner_user_id,request_id FROM public.personal_wallet_expenses WHERE request_id IS NOT NULL
GROUP BY 1,2 HAVING COUNT(*)>1) d
UNION ALL SELECT 'engine_completed_payment_breakdown_difference', COUNT(*) FROM public.financial_operations
WHERE status='COMPLETED' AND operation_type='PAYMENT'
AND ABS(COALESCE(amount_received,0)-COALESCE(principal_paid,0)
-COALESCE(interest_paid,0)-COALESCE(late_fee_paid,0))>0.011
UNION ALL SELECT 'engine_duplicate_idempotency', COUNT(*) FROM (
SELECT idempotency_key FROM public.financial_operations WHERE idempotency_key IS NOT NULL
GROUP BY 1 HAVING COUNT(*)>1) d
UNION ALL SELECT 'payments_duplicate_idempotency', COUNT(*) FROM (
SELECT idempotency_key FROM public.payment_transactions WHERE idempotency_key IS NOT NULL
GROUP BY 1 HAVING COUNT(*)>1) d
UNION ALL SELECT 'payments_invalid_amount', COUNT(*) FROM public.payment_transactions WHERE amount<=0
UNION ALL SELECT 'orphan_payment_reversal', COUNT(*) FROM public.payment_reversals r
LEFT JOIN public.payment_transactions t ON t.id=r.payment_id WHERE t.id IS NULL
ORDER BY invariant;
