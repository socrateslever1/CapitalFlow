# Wallet Credit Separation Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add traceable monthly invoice overrides, correct current/future/free-limit math, and make the selected invoice statement reactively editable.

**Architecture:** Store overrides as typed rows in the existing expense/installment domain. Centralize effective invoice math in PostgreSQL mutation paths and a shared TypeScript projection used by cards and the general balance.

**Tech Stack:** PostgreSQL 17, Supabase RPC/PostgREST, TypeScript 5.8, React 19.

**Spec:** `docs/superpowers/specs/2026-10-26-wallet-credit-separation-phase-3-design.md`

## Global Constraints

- No parallel tables and no unrelated refactors.
- Preserve existing RPCs; new RPCs require UUID v4 request IDs.
- Lock the card before dependent rows, validate `auth.uid()` ownership and platform superadmin permission, and grant execute only to `authenticated`.
- Preserve unrelated dirty worktree changes from Phases 1 and 2.

## Review Focus

- Override replay with the same request and rejection when payload differs.
- Override replacement for a month without double-counting itemized rows.
- A paid override must not expose the underlying itemized cycle again.
- Editing/deleting a purchase in an overridden cycle must still update future commitments safely.
- Balance liabilities must include only the current calendar month's effective invoices.

---

### Task 1: Effective credit projection

**Files:**
- Modify: `components/wallet/invoiceStatementDomain.ts`
- Test: `tests/wallet/invoice-credit-separation.test.ts`

**Interfaces:**
- Produces: `getCardCreditPosition(card, expenses, installments)` and effective cycle summaries.

- [ ] Write failing tests for current/future separation, override substitution, paid override suppression, and free-limit clamping.
- [ ] Run the focused test and confirm it fails because the projection is absent.
- [ ] Implement the smallest shared projection and statement-entry metadata.
- [ ] Run the focused tests to green.

### Task 2: Atomic canonical RPCs

**Files:**
- Create: `supabase/migrations/<generated>_wallet_credit_separation_phase3.sql`
- Test: `tests/wallet/wallet-credit-phase3-migration.test.ts`

**Interfaces:**
- Produces: `personal_wallet_set_monthly_invoice_override`, `personal_wallet_update_expense_idempotent`, `personal_wallet_cancel_expense_idempotent`, and effective card recalculation helpers.

- [ ] Write failing migration contract tests for schema, locks, ownership, idempotency, override-aware payments, and grants.
- [ ] Generate the migration with Supabase CLI.
- [ ] Implement additive columns, constraints/indexes, helper functions, and RPCs.
- [ ] Run migration tests to green.

### Task 3: Service and cards UI

**Files:**
- Modify: `services/personalWallet.service.ts`
- Create: `components/wallet/InvoiceOverrideModal.tsx`
- Modify: `components/wallet/CardInvoiceStatement.tsx`
- Modify: `features/wallet/pages/WalletCardsPage.tsx`
- Modify: `features/wallet/pages/WalletOverviewPage.tsx`
- Modify: `pages/PersonalWalletPage.tsx`

**Interfaces:**
- Consumes: projection and Phase 3 RPCs.

- [ ] Write failing frontend contract tests for the three indicators, modal RPC, UUID request IDs, and reactive refresh.
- [ ] Add service methods and types.
- [ ] Add the compact accessible override modal and selected-cycle controls.
- [ ] Route edit/delete through idempotent RPCs and refresh after success.
- [ ] Use effective current-month invoices in both balance views.
- [ ] Run focused wallet tests, architecture checks, typecheck/build, and scoped diff checks.

