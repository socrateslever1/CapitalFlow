import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWalletTimeline } from '../../features/wallet/domain/walletTimeline';

test('mantém transferência entre carteiras neutra e ordena a linha do tempo', () => {
  const events = buildWalletTimeline({
    referenceDate: '2026-11-04',
    operations: [{
      id: 'transfer-1', request_id: 'req-1', operation_type: 'TRANSFER',
      from_account_id: 'a', to_account_id: 'b', amount: 250,
      description: 'Reserva', operation_date: '2026-11-05',
    }],
    expenses: [], installments: [], payables: [], invoicePayments: [],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'TRANSFER');
  assert.equal(events[0].direction, 'NEUTRAL');
  assert.equal(events[0].amount, 250);
  assert.equal(events[0].status, 'SCHEDULED');
});

test('mostra somente o saldo restante de parcelas e marca vencimentos atrasados', () => {
  const events = buildWalletTimeline({
    referenceDate: '2026-11-04',
    operations: [],
    expenses: [{ id: 'expense-1', description: 'Compra parcelada', card_id: 'card-1' }],
    installments: [
      { id: 'i-paid', expense_id: 'expense-1', installment_number: 1, due_month: '2026-10-01', amount: 100, paid_amount: 100, status: 'PAID' },
      { id: 'i-open', expense_id: 'expense-1', installment_number: 2, due_month: '2026-11-01', amount: 100, paid_amount: 25, status: 'PENDING' },
    ],
    payables: [{
      id: 'payable-1', description: 'Conta vencida', creditor_name: 'Fornecedor',
      outstanding_balance: 300, due_date: '2026-11-03',
      status: 'OVERDUE',
    }],
    invoicePayments: [],
  });

  assert.deepEqual(events.map(event => event.id), ['i-open', 'payable-1']);
  assert.equal(events[0].status, 'OVERDUE');
  assert.equal(events[0].amount, 75);
  assert.equal(events[1].status, 'OVERDUE');
  assert.equal(events[1].amount, 300);
});
