import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWalletTimeline } from '../../features/wallet/domain/walletTimeline';
import type { PersonalWalletAccount, PersonalWalletCard, PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../services/personalWallet.service';

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

test('uma quitação em duas fontes mostra o mesmo credor sem duplicar a operação da conta', () => {
  const events = buildWalletTimeline({
    referenceDate: '2026-11-06',
    operations: [
      { id: 'payout-op', operation_type: 'PAYMENT', from_account_id: 'recarga',
        to_account_id: null, amount: 1167.04, description: 'Pagamento: Marlucia',
        operation_date: '2026-11-05' },
      { id: 'transfer-op', operation_type: 'TRANSFER', from_account_id: 'nubank',
        to_account_id: 'recarga', amount: 162.06, description: 'Pagar contas',
        operation_date: '2026-11-05' },
    ],
    payables: [{ id: 'aluguel', creditor_name: 'Marlucia', description: 'Aluguel',
      status: 'PAID', due_date: '2026-11-05', outstanding_balance: 0 }],
    payablePayments: [{ id: 'payment-1', payable_id: 'aluguel', amount: 1264.23,
      account_id: null, proof_path: null, paid_at: '2026-11-05T22:16:01Z' }],
    payablePaymentSources: [
      { id: 's1', payment_id: 'payment-1', source_kind: 'ACCOUNT', account_id: 'recarga',
        card_id: null, expense_id: null, principal_amount: 1167.04,
        interest_rate: 0, interest_amount: 0 },
      { id: 's2', payment_id: 'payment-1', source_kind: 'CARD', account_id: null,
        card_id: 'picpay', expense_id: 'expense-102', principal_amount: 97.19,
        interest_rate: 4.99, interest_amount: 4.85 },
    ],
    accounts: [
      { id: 'nubank', nickname: 'Nubank' },
      { id: 'recarga', nickname: 'RecargaPay' },
    ] as PersonalWalletAccount[],
    cards: [{
      id: 'picpay', nickname: 'PicPay', status: 'ACTIVE', closing_day: 26,
      due_day: 5, credit_limit: 4000,
    } as PersonalWalletCard],
    expenses: [], installments: [], invoicePayments: [],
  });
  assert.equal(events.filter(e => e.kind === 'PAYABLE_PAYMENT').length, 1);
  assert.equal(events.filter(e => e.kind === 'OPERATION').length, 0);
  const payment = events.find(e => e.kind === 'PAYABLE_PAYMENT');
  assert.equal(payment?.label, 'Quitação: Marlucia');
  assert.equal(payment?.amount, 1264.23);
  assert.equal(payment?.status, 'PAID');
  assert.deepEqual(payment?.sources, [
    { kind: 'ACCOUNT', label: 'Conta RecargaPay', principal: 1167.04, cardInterest: 0 },
    { kind: 'CARD', label: 'Cartão PicPay', principal: 97.19, cardInterest: 4.85 },
  ]);
  const transfer = events.find(e => e.kind === 'TRANSFER');
  assert.equal(transfer?.label, 'Transferência interna: Nubank → RecargaPay');
  assert.equal(transfer?.direction, 'NEUTRAL');
  assert(!events.some(e => e.status === 'OVERDUE'));
});

test('não afirma origem completa nem esconde lançamento se o pagamento não tiver comprovantes vinculados', () => {
  const events = buildWalletTimeline({
    referenceDate: '2026-11-06', operations: [{
      id: 'operation', operation_type: 'PAYMENT', from_account_id: 'recarga',
      to_account_id: null, description: 'Pagamento: Marlucia',
      operation_date: '2026-11-05', amount: 1167.04,
    }], payables: [{
      id: 'payable', creditor_name: 'Marlucia', description: 'Aluguel',
      outstanding_balance: 0, status: 'PAID', due_date: '2026-11-05',
    }], payablePayments: [{
      id: 'settlement', payable_id: 'payable', account_id: null,
      amount: 1264.23, proof_path: null, paid_at: '2026-11-05T22:16:00Z',
    }], payablePaymentSources: [{
      id: 'incomplete', payment_id: 'settlement', source_kind: 'ACCOUNT',
      account_id: 'recarga', card_id: null, expense_id: null,
      principal_amount: 1167.04, interest_rate: 0, interest_amount: 0,
    }], expenses: [], installments: [], invoicePayments: [],
  });
  assert.equal(events.find(event => event.kind === 'PAYABLE_PAYMENT')?.sources, undefined);
  assert.equal(events.filter(event => event.kind === 'OPERATION').length, 1);
});
