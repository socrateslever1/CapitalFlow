# CapitalFlow Wallet Credit Separation Phase 3 Design

## Intent

Separate the active invoice, future card commitments, and free credit limit so future installments never inflate the current month's liabilities. Allow a user to set a traceable consolidated amount for one invoice cycle while preserving itemized purchases.

## Constraints

- Reuse only `personal_wallet_cards`, `personal_wallet_expenses`, `personal_wallet_expense_installments`, and `personal_wallet_invoice_payments`.
- Do not create a parallel table or backfill artificial balances.
- Preserve existing RPC names and behavior for existing callers.
- All new financial mutations are atomic, idempotent by UUID request ID, owner-scoped, and restricted to authenticated platform superadmins.

## Chosen approach

Represent an invoice override as a canonical `personal_wallet_expenses` row with `entry_type = 'INVOICE_OVERRIDE'`, its target month in `invoice_due_month`, its creation request in `request_id`, and one canonical installment. The effective amount for an overridden month is that override installment; ordinary installments for the same month remain auditable and visible but do not contribute again to the invoice or credit usage.

The active cycle is the earliest month that still has an effective pending balance. Its effective balance is the current invoice. Effective balances in later months are future commitments. Free limit is `greatest(0, credit_limit - current_invoice - future_commitments)`.

Existing edit and cancellation RPCs remain available. New idempotent RPCs with distinct names are used by the editable statement because Supabase's Data API does not support overloaded function names reliably.

## Payment behavior

When a cycle has an override, invoice payments amortize the override installment only. Ordinary installments for that overridden cycle remain as audit detail and are excluded from effective balances permanently, preventing them from reappearing after the override is paid.

## UI

The selected card shows three responsive indicators: current invoice, future installments, and free limit. A compact modal defines the selected cycle's invoice amount. The statement lists the selected cycle, identifies its manual consolidated amount, and keeps individual purchase edit/delete actions. Successful writes await snapshot refresh so values update without a page reload.

## Approaches considered

- Chosen: canonical synthetic expense/installment. It preserves relational auditability without a new table.
- Rejected: JSONB override history on the card. It weakens constraints, indexing, and payment allocation.
- Rejected: storing overrides in invoice payments. A payable amount is not a payment and would corrupt the meaning of the canonical payment ledger.

