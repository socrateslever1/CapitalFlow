import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync('services/personalWallet.service.ts', 'utf8');

test('serviço expõe leitura e mutação histórica pelo contrato RPC', () => {
  assert.match(service, /listHistoricalReceiptCandidates/);
  assert.match(service, /personal_wallet_list_historical_receipts/);
  assert.match(service, /reconcileHistoricalReceipt/);
  assert.match(service, /personal_wallet_reconcile_historical_receipt/);
  assert.match(service, /p_destination_account_id/);
  assert.match(service, /p_destination_source_id/);
  assert.match(service, /p_reason/);
});

test('reconciliação é bloqueada sem destino e sem motivo', () => {
  assert.match(service, /!input\.destinationAccountId && !input\.destinationSourceId/);
  assert.match(service, /!reason \|\| reason\.length > 500/);
});

test('conciliação é visível em Receitas somente após autorização de SUPER_ADMIN pelo Supabase', () => {
  const incomePage = readFileSync('features/wallet/pages/WalletIncomePage.tsx', 'utf8');
  const overviewPage = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
  assert.match(incomePage, /platformAdminService\.isSuperAdmin\(\)/);
  assert.match(incomePage, /canReconcile &&/);
  assert.match(incomePage, /Conciliar recebimentos de contratos/);
  assert.match(incomePage, /HistoricalReceiptReconciliationPanel onSaved/);
  assert.doesNotMatch(overviewPage, /activeUser\?\.role === 'SUPER_ADMIN'/);
});

test('seleção de destino segue o reinício lógico e distingue contas homônimas', () => {
  const service = readFileSync('services/personalWallet.service.ts', 'utf8');
  const panel = readFileSync('features/wallet/components/HistoricalReceiptReconciliationPanel.tsx', 'utf8');
  assert.match(service, /async listHistoricalReceiptDestinations\(/);
  assert.match(service, /getActiveWalletReset\(\)/);
  assert.match(service, /filterCurrentWalletRows\(accounts\.data as PersonalWalletAccount\[\], walletReset, 'accounts'\)/);
  assert.match(panel, /criada \$\{created\}/);
  assert.match(panel, /formatMoney\(Number\(account\.balance\)\)/);
  assert.match(panel, /não são contemplados por este mecanismo/);
});
