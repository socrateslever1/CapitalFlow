# CapitalFlow Wallet Charge Integration — Phase 2 Design

## Scope

Persist static PIX charges in the canonical `payment_charges` table, bind them to a canonical wallet account, and settle them manually through one atomic wallet RPC. Provider charges remain on their existing Mercado Pago/Asaas paths.

## Data model

`payment_charges` receives nullable, backward-compatible wallet columns: `owner_user_id`, `account_id`, `description`, `create_request_id`, `settled_request_id`, `settled_amount`, and `settlement_occurred_at`. They are mandatory only when `provider = 'STATIC_PIX'`. `personal_wallet_account_operations.charge_id` provides the immutable audit link.

## RPCs

- `personal_wallet_create_charge(account, amount, description, request)` validates authentication, platform-superadmin permission, account ownership and PIX availability; then inserts one idempotent `STATIC_PIX/PENDING` charge.
- `personal_wallet_settle_charge(charge, account, amount, occurred_at, request)` accepts only an owned `STATIC_PIX` charge, checks the exact original amount, locks charge and account, marks the charge `PAID`, credits the account, and inserts one `RECEIPT` ledger entry.

Both RPCs pin their search path, serialize wallet writes per owner, reject mismatched request replays, revoke default execution, and grant only to `authenticated`.

## Frontend

The charge page selects an account with a PIX key, amount and description. “Generate” first persists the charge through the creation RPC, then builds and displays the CRC16-valid EMV payload. Manual receipt confirmation reuses one request UUID for safe retry, calls the settlement RPC, and refreshes the shared wallet snapshot.

## Non-goals

- No bank settlement, webhook, Open Finance, or Bacen integration.
- No direct write from the browser to financial tables.
- No change to gateway charge creation, webhooks, or legacy `fontes` accounting.
