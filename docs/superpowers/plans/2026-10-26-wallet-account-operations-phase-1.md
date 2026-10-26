# Wallet Account Operations Phase 1 Implementation Plan

**Goal:** Add atomic, idempotent account transfers, external transfer records, invoice payments, auditable opening balances, and one account statement view using only the canonical wallet domain.

**Constraints:** Preserve existing authorization (`auth.uid()` plus platform superadmin), keep PDF rows non-posting, never backfill balances, and do not apply the migration to the remote database from this worktree task.

## Tasks

1. Add regression tests for SQL guards, idempotency, statement composition, and open-invoice options.
2. Create one migration that extends `personal_wallet_account_operations`, adds the external-transfer and opening-balance RPCs, and hardens `personal_wallet_pay_invoice_partial`.
3. Extend the wallet service and build a responsive three-tab movement modal using the shared `Modal` component.
4. Add optional audited opening balance to account creation and unify operational, invoice-payment, and imported statement rows without double counting.
5. Run targeted tests, architecture tests, typecheck/build, and diff checks.

## Review focus

- Concurrent debits must not produce negative balances.
- Retrying the same request ID must never post twice and must reject mismatched payloads.
- Account-funded invoice payments must produce exactly one visible statement debit.
- External PIX/TED wording must never imply actual bank settlement.
- Existing unrelated worktree changes must remain untouched.
