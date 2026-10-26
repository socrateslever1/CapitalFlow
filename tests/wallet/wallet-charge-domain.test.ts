import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidPixPayload } from '../../components/wallet/pixPayload';
import { buildPersistedPixCharge } from '../../components/wallet/walletChargeDomain';
import { buildAccountStatementEntries } from '../../components/wallet/accountStatementDomain';

test('builds QR preview only from a persisted wallet charge', () => {
  const preview = buildPersistedPixCharge({
    chargeId: '11111111-1111-4111-8111-111111111111',
    account: { id: 'account-1', pix_key: 'pix@example.com', nickname: 'Conta principal' },
    recipient: 'Ana Silva', city: 'Manaus', amount: 125.4,
    description: 'Pedido 42', origin: 'https://capitalflow.app',
  });

  assert.equal(isValidPixPayload(preview.payload), true);
  assert.equal(preview.chargeId, '11111111-1111-4111-8111-111111111111');
  const url = new URL(preview.url);
  assert.equal(url.pathname, '/pix/cobrar');
  assert.equal(url.searchParams.get('charge'), preview.chargeId);
  assert.equal(url.searchParams.get('brcode'), preview.payload);
});

test('rejects a preview without persisted charge or account PIX metadata', () => {
  const base = {
    chargeId: '11111111-1111-4111-8111-111111111111',
    account: { id: 'account-1', pix_key: 'pix@example.com', nickname: 'Conta principal' },
    recipient: 'Ana Silva', city: 'Manaus', amount: 10,
    description: 'Pedido', origin: 'https://capitalflow.app',
  };
  assert.throws(() => buildPersistedPixCharge({ ...base, chargeId: '' }), /persistida/i);
  assert.throws(() => buildPersistedPixCharge({ ...base, account: { ...base.account, pix_key: null } }), /pix/i);
});

test('labels a settled charge receipt in the unified account statement', () => {
  const entries = buildAccountStatementEntries({
    accountId: 'account-1', accounts: [{ id: 'account-1', nickname: 'Conta' }],
    expenses: [], invoicePayments: [], statementRows: [],
    operations: [{
      id: 'operation-1', request_id: 'request-1', operation_type: 'RECEIPT',
      from_account_id: null, to_account_id: 'account-1', amount: 90,
      description: 'Recebimento PIX - Pedido 42', category: 'Cobranca PIX',
      operation_date: '2026-10-26', created_at: '2026-10-26T20:00:00Z',
      charge_id: 'charge-1',
    }],
  });
  assert.equal(entries[0]?.tag, 'Cobrança recebida');
  assert.equal(entries[0]?.amount, 90);
});
