# Wallet Charge Integration Phase 2 Implementation Plan

**Goal:** Persist and atomically settle wallet-owned static PIX charges without affecting provider charges.

1. Add failing migration-contract tests for additive columns, provider isolation, ownership, idempotency, locks, exact amount, ledger link, and grants.
2. Create the migration with the two RPCs and compatible RLS extension.
3. Add failing domain tests for the persisted PIX preview and public link.
4. Extend the wallet service and charge UI so persistence precedes QR display and settlement refreshes wallet data.
5. Run wallet tests, architecture checks, typecheck, production build, and diff review.

## Review focus

- Gateway charges must be categorically rejected by manual settlement.
- A replay must never credit twice.
- Amount/account/request mismatches must fail closed.
- Existing gateway rows with null wallet metadata must remain valid.
- The UI must never imply automatic bank confirmation.
