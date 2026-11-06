import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWalletTimeline } from '../../features/wallet/domain/walletTimeline';
import type { PersonalWalletCard, PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../services/personalWallet.service';

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

test('sem metadados do cartão, não inventa vencimento de parcela; cobrança real ainda pode vencer', () => {
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
  assert.equal(events[0].status, 'SCHEDULED');
  assert.equal(events[0].amount, 75);
  assert.equal(events[1].status, 'OVERDUE');
  assert.equal(events[1].amount, 300);
});

test('não chama operação já lançada de pendente', () => {
  const events = buildWalletTimeline({
    referenceDate: '2026-11-05',
    operations: [{
      id: 'operation-1', operation_type: 'INCOME', from_account_id: null,
      to_account_id: 'account-1', amount: 150, description: 'Recebi no pix',
      operation_date: '2026-11-05',
    }],
    expenses: [], installments: [], payables: [], invoicePayments: [],
  });
  assert.equal(events[0].status, 'RECORDED');
});

test('R$ 102,04 de obrigação quitada pelo PicPay integra a fatura de dezembro, sem dívida artificial', () => {
  const expense: PersonalWalletExpense = {
    id: 'expense-102', description: 'Divida: Marlucia', amount: 102.04,
    category: 'Aluguel', expense_date: '2026-11-05', due_date: '2026-12-05',
    card_id: 'picpay', status: 'PENDING', installment_count: 1, entry_type: 'PURCHASE',
  };
  const installment: PersonalWalletExpenseInstallment = {
    id: 'installment-102', expense_id: 'expense-102', installment_number: 1,
    due_month: '2026-12-01', amount: 102.04, paid_amount: 0, status: 'PENDING',
  };
  const events = buildWalletTimeline({
    referenceDate: '2026-11-06', operations: [], expenses: [expense],
    installments: [installment],
    cards: [{ id: 'picpay', nickname: 'PicPay', status: 'ACTIVE',
      closing_day: 26, due_day: 5, credit_limit: 4000, initial_future_installments_balance: 0 } as PersonalWalletCard],
    payables: [{ id: 'rent', description: 'Aluguel', creditor_name: 'Marlucia',
      outstanding_balance: 0, due_date: '2026-11-05', status: 'PAID' }],
    invoicePayments: [],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].label, 'Fatura PicPay');
  assert.equal(events[0].kind, 'CARD_INVOICE');
  assert.equal(events[0].amount, 102.04);
  assert.equal(events[0].date, '2026-12-05');
  assert.equal(events[0].status, 'SCHEDULED');
  assert(!events.some(e => e.kind === 'PAYABLE' || e.status === 'OVERDUE'));
});
