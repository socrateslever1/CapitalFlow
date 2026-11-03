# Wallet financial corrections — implementation plan

> **For agentic workers:** execute the existing audit findings with regression tests, small changes and a final independent review. User authorized execution with GO; no additional design approval is pending.

**Goal:** remove confirmed financial ambiguity and prevent sensitive data exposure without replacing the canonical financial engine.

**Architecture:** keep payments, ledger and invoice RPCs authoritative. Correct the import session state and identity-based aggregation; page financial reads completely and recheck duplicate candidates before import. Keep AI credentials behind authenticated server endpoints and card photos local.

**Tech stack:** existing React/TypeScript/Vite, Supabase client, Express and Cloudflare Functions, Node test runner/tsx. No new dependency.

**Spec:** user-approved audit in this conversation; PRODUCT.md, DESIGN.md, AGENTS.md, docs/CARTEIRA_CONTINUIDADE.md.

## Constraints
- Preserve unrelated work, existing routes and canonical financial mutations.
- No production data mutation, deployment, publication or automatic cleanup of legacy ciphertext.
- Preserve cents, user isolation, retries and explicit duplicate approval.
- Separate code, browser and physical-device evidence; never claim one proves another.

## Tasks
- [ ] Import state: regressions for summary then purchase, other cycles/cards, document-only mode, retries and both readers; update state only when the canonical response confirms financial application.
- [ ] Financial totals: regressions for distinct CASH accounts with identical metadata, overlimit cards, empty/negative/cent amounts and projection versus actual account balance.
- [ ] Complete reads: paginated financial queries, stable order, lower server page cap and late errors; fresh target/date duplicate review must succeed before any import write.
- [ ] Security: no new CVC encryption, compatible legacy read/migration, authenticated bounded AI proxy without client secrets, explicit document consent, local-only card photos.
- [ ] Build/release: distinguish native inbox filenames on Windows; exact-SHA full gates, fail-closed release lookup, safe identical reruns and no cancellation mid-publication.
- [ ] Integration: wire regression suites into required commands; update continuity documentation with actual results and remaining physical/deployment checks.
- [ ] Run test:quality, test:wallet-visual-next, targeted regressions, audit and diff checks; final independent review and any necessary corrections.

## Review focus
- Financial summary without opening must not imply ledger changes or mark unrelated purchases INCLUDED.
- Failed refresh/uncertain response must not create another summary operation or duplicate purchase.
- A truncated/erroring read must not be presented as complete financial evidence.
- A consent rejection must result in zero external AI calls.
- Release recovery must never allow downgrade, certificate changes or different bytes at the same versionCode.

## Execution record
- Baseline: main b7cb10e; clean checkout. Prior audit already verified the findings and focused tests.
- Owner split: import reader agent; security/proxy agent; Android/release agent; root owns totals, complete reads, service boundaries, integration and documentation.
- Physical Android/tablet and deployed-bank/release behavior require external evidence and remain separate from code validation.
