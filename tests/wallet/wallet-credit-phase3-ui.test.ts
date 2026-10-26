import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('cards page exposes the three credit magnitudes and the manual override action', () => {
  const page = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  assert.match(page, /Fatura do Mês/);
  assert.match(page, /Parcelas Futuras/);
  assert.match(page, /Limite Livre/);
  assert.match(page, /Definir Valor da Fatura/);
  assert.match(page, /InvoiceOverrideModal/);
});

test('wallet service dispatches all phase 3 financial writes through RPCs with request ids', () => {
  const service = readFileSync('services/personalWallet.service.ts', 'utf8');
  assert.match(service, /personal_wallet_set_monthly_invoice_override/);
  assert.match(service, /personal_wallet_update_expense_idempotent/);
  assert.match(service, /personal_wallet_cancel_expense_idempotent/);
  assert.match(service, /p_request_id/);
});

test('both balance views consume effective invoice cycle math', () => {
  const modern = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
  const legacy = readFileSync('pages/PersonalWalletPage.tsx', 'utf8');
  assert.match(modern, /getEffectiveInvoiceCycles/);
  assert.match(legacy, /getEffectiveInvoiceCycles/);
});

