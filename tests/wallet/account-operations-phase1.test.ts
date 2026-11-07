import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildAccountStatementEntries,
  buildOpenInvoiceOptions,
} from '../../components/wallet/accountStatementDomain';

const migration = readFileSync(
  'supabase/migrations/20261026213438_wallet_account_operations_phase1.sql',
  'utf8',
).toLowerCase();

test('migration protects every posting RPC with ownership, locks and idempotency', () => {
  for (const required of [
    'personal_wallet_record_external_transfer',
    'personal_wallet_initialize_account_opening',
    'personal_wallet_pay_invoice_partial',
    'personal_wallet_record_account_operation',
    'is_platform_super_admin',
    'pg_advisory_xact_lock',
    'for update',
    'request_id',
    'saldo insuficiente na conta de origem',
  ]) assert.match(migration, new RegExp(required));

  assert.match(migration, /operation_type[^;]+external_transfer/s);
  assert.match(migration, /recipient_name/);
  assert.match(migration, /pix_key/);
  assert.match(migration, /external_identifier/);
  assert.match(migration, /occurred_at/);
  assert.match(migration, /insert into public\.personal_wallet_account_operations[\s\S]+?'payment'/);
});

test('opening balance refuses accounts with previous operations and has no balance backfill', () => {
  assert.match(migration, /nao pode receber saldo inicial porque ja possui movimentacoes/);
  assert.doesNotMatch(migration, /update public\.personal_wallet_accounts[\s\S]+set balance[\s\S]+where balance is null/);
});

test('unified statement includes imports and hides the legacy invoice duplicate by request id', () => {
  const entries = buildAccountStatementEntries({
    accountId: 'account-1',
    accounts: [
      { id: 'account-1', nickname: 'Origem' },
      { id: 'account-2', nickname: 'Destino' },
    ],
    operations: [{
      id: 'operation-1', request_id: 'request-1', operation_type: 'PAYMENT',
      from_account_id: 'account-1', to_account_id: null, amount: 100,
      description: 'Pagamento de fatura', category: 'Cartao', operation_date: '2026-10-26',
      occurred_at: '2026-10-26T15:00:00Z', created_at: '2026-10-26T15:00:00Z',
    }],
    expenses: [],
    invoicePayments: [{
      id: 'payment-1', request_id: 'request-1', card_id: 'card-1', due_month: '2026-10-01',
      account_id: 'account-1', amount: 100, source: 'ACCOUNT', created_at: '2026-10-26T15:00:00Z',
    }],
    statementRows: [{
      id: 'row-1', target_kind: 'ACCOUNT', target_id: 'account-1', document_hash: 'a'.repeat(64),
      row_key: 'row', entry_date: '2026-10-25', description: 'Linha importada', amount: -20, category: 'PDF',
    }],
  });

  assert.deepEqual(entries.map(entry => entry.id), ['operation-1', 'import-row-1']);
  assert.equal(entries[0]?.tag, 'Pagamento de fatura');
  assert.equal(entries[1]?.tag, 'Importado de PDF');
});

test('open invoice options are grouped by card and due month using only pending balances', () => {
  const options = buildOpenInvoiceOptions(
    [{ id: 'card-1', nickname: 'Nubank' }],
    [{ id: 'expense-1', card_id: 'card-1' }],
    [
      { id: 'i1', expense_id: 'expense-1', due_month: '2026-10-01', amount: 200, paid_amount: 50, status: 'PENDING' },
      { id: 'i2', expense_id: 'expense-1', due_month: '2026-10-01', amount: 100, paid_amount: 100, status: 'PAID' },
      { id: 'i3', expense_id: 'expense-1', due_month: '2026-11-01', amount: 80, paid_amount: 0, status: 'PENDING' },
    ],
  );

  assert.deepEqual(options.map(option => [option.dueMonth, option.openAmount]), [
    ['2026-10-01', 150],
    ['2026-11-01', 80],
  ]);
});
