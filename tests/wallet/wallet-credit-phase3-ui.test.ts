import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('cards page exposes the three credit magnitudes and the manual override action', () => {
  const page = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  const modal = readFileSync('components/wallet/InvoiceOverrideModal.tsx', 'utf8');
  assert.match(page, /formatMoney\(cycle\.amount\)/);
  assert.match(page, /banco informou \$\{formatMoney\(bankInvoiceTotal\)\}/);
  assert.match(page, /Próximas faturas/);
  assert.match(page, /formatCardAvailableOrigin\(availablePresentation\?\.bankReference/);
  const presentation = readFileSync('features/wallet/domain/cardAvailablePresentation.ts', 'utf8');
  assert.match(presentation, /'Disponível · banco '/);
  assert.match(presentation, /'Limite estimado'/);
  assert.match(page, /bankLimitReference=/);
  assert.match(page, /saveObservedBankAvailable/);
  assert.match(page, /usedLimit: \(limitCents - amountCents\) \/ 100/);
  assert.match(page, /Ajustar fatura/);
  assert.match(page, /InvoiceOverrideModal/);
  assert.match(modal, /saveLabel="Salvar valores do banco"/);
  assert.doesNotMatch(page, /Definir vencimento e valores|Corrigir vencimento e valores/);
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

test('expense mutations keep the same request id while the user retries the same action', () => {
  const editModal = readFileSync('components/wallet/ExpenseEditModal.tsx', 'utf8');
  const statement = readFileSync('components/wallet/CardInvoiceStatement.tsx', 'utf8');
  assert.match(editModal, /useRef\(generateUUID\(\)\)/);
  assert.match(editModal, /onSave\([\s\S]*requestId\.current/);
  assert.match(statement, /deleteRequestIds/);
  assert.match(statement, /onDelete\(expense\.id,\s*requestId\)/);
});
