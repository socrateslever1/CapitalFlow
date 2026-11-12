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
