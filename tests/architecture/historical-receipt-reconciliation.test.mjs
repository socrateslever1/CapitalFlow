import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync('services/personalWallet.service.ts', 'utf8');

test('serviço frontend não expõe leitura nem mutação de reconciliação histórica', () => {
  assert.doesNotMatch(service, /listHistoricalReceiptCandidates/);
  assert.doesNotMatch(service, /personal_wallet_list_historical_receipts/);
  assert.doesNotMatch(service, /reconcileHistoricalReceipt/);
  assert.doesNotMatch(service, /personal_wallet_reconcile_historical_receipt/);
  assert.doesNotMatch(service, /listHistoricalReceiptDestinations/);
});

test('painel de reconciliação histórica foi removido da interface da Carteira', () => {
  assert.equal(existsSync('features/wallet/components/HistoricalReceiptReconciliationPanel.tsx'), false);
});

test('Receitas não exibe fluxo de conciliação histórica e preserva recebimentos atuais e recorrentes', () => {
  const incomePage = readFileSync('features/wallet/pages/WalletIncomePage.tsx', 'utf8');
  const overviewPage = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
  assert.doesNotMatch(incomePage, /Conciliar recebimentos de contratos/);
  assert.doesNotMatch(incomePage, /HistoricalReceiptReconciliationPanel/);
  assert.doesNotMatch(incomePage, /platformAdminService\.isSuperAdmin\(\)/);
  assert.doesNotMatch(overviewPage, /activeUser\?\.role === 'SUPER_ADMIN'/);
  assert.match(incomePage, /Histórico de entradas avulsas/);
  assert.match(incomePage, /RecurringIncomePanel/);
  assert.match(incomePage, /isExternalIncome/);
});
