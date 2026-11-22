import assert from 'node:assert/strict';
import test from 'node:test';
import { getCardCreditPosition, getEffectiveInvoiceCycles, getSelectedInvoiceCycle, getInvoiceOpeningBreakdown } from '../../components/wallet/invoiceStatementDomain';

const card = { id: 'card-1', credit_limit: 2000 };
const expenses = [
  { id: 'purchase-1', card_id: 'card-1', description: 'Notebook', amount: 900, category: 'Compras', expense_date: '2026-10-01', due_date: '2026-10-10', status: 'PENDING', installment_count: 3, entry_type: 'PURCHASE' as const },
  { id: 'override-1', card_id: 'card-1', description: 'Fatura consolidada 10/2026', amount: 250, category: 'Ajuste de fatura', expense_date: '2026-10-01', due_date: '2026-10-01', status: 'PENDING', installment_count: 1, entry_type: 'INVOICE_OVERRIDE' as const, invoice_due_month: '2026-10-01' },
];
const installments = [
  { id: 'p1', expense_id: 'purchase-1', installment_number: 1, due_month: '2026-10-01', amount: 300, paid_amount: 0, status: 'PENDING' as const },
  { id: 'p2', expense_id: 'purchase-1', installment_number: 2, due_month: '2026-11-01', amount: 300, paid_amount: 0, status: 'PENDING' as const },
  { id: 'p3', expense_id: 'purchase-1', installment_number: 3, due_month: '2026-12-01', amount: 300, paid_amount: 0, status: 'PENDING' as const },
  { id: 'o1', expense_id: 'override-1', installment_number: 1, due_month: '2026-10-01', amount: 250, paid_amount: 0, status: 'PENDING' as const },
];

test('override substitutes the itemized cycle while later installments remain future commitments', () => {
  const position = getCardCreditPosition(card, expenses, installments);
  assert.deepEqual(position, {
    dueMonth: '2026-10-01',
    currentInvoice: 250,
    futureCommitments: 600,
    committedLimit: 850,
    freeLimit: 1150,
    hasOverride: true,
  });
});

test('paid override permanently suppresses itemized rows from the overridden cycle', () => {
  const paid = installments.map(item => item.id === 'o1' ? { ...item, paid_amount: 250, status: 'PAID' as const } : item);
  const cycles = getEffectiveInvoiceCycles('card-1', expenses, paid);
  assert.deepEqual(cycles.map(cycle => [cycle.dueMonth, cycle.amount]), [
    ['2026-10-01', 0],
    ['2026-11-01', 300],
    ['2026-12-01', 300],
  ]);
  const position = getCardCreditPosition(card, expenses, paid);
  assert.equal(position.dueMonth, '2026-11-01');
  assert.equal(position.currentInvoice, 300);
  assert.equal(position.futureCommitments, 300);
});

test('free limit never becomes negative', () => {
  const position = getCardCreditPosition({ id: 'card-1', credit_limit: 500 }, expenses, installments);
  assert.equal(position.freeLimit, 0);
  assert.equal(position.committedLimit, 850);
});

test('available credit subtracts current and future commitments with exact cents', () => {
  const position = getCardCreditPosition(
    { id: 'card-1', credit_limit: 10000 },
    [
      { id: 'current', card_id: 'card-1', description: 'Fatura atual', amount: 2930.88,
        category: 'Ajuste de fatura', expense_date: '2026-11-19', due_date: '2026-12-03',
        status: 'PENDING', installment_count: 1, entry_type: 'INVOICE_OVERRIDE' as const,
        invoice_due_month: '2026-12-01' },
      { id: 'future', card_id: 'card-1', description: 'Parcelas futuras', amount: 4385.61,
        category: 'Compras', expense_date: '2026-11-19', due_date: '2027-01-03',
        status: 'PENDING', installment_count: 1, entry_type: 'PURCHASE' as const },
    ],
    [
      { id: 'current-i', expense_id: 'current', installment_number: 1, due_month: '2026-12-01',
        amount: 2930.88, paid_amount: 0, status: 'PENDING' as const },
      { id: 'future-i', expense_id: 'future', installment_number: 1, due_month: '2027-01-01',
        amount: 4385.61, paid_amount: 0, status: 'PENDING' as const },
    ],
  );

  assert.equal(position.committedLimit, 7316.49);
  assert.equal(position.freeLimit, 2683.51);
});

test('selected invoice cycle never inherits the previous invoice amount', () => {
  assert.deepEqual(getSelectedInvoiceCycle('card-1', '2026-11-01', expenses, installments), {
    dueMonth: '2026-11-01',
    amount: 300,
    hasOverride: false,
  });
  assert.deepEqual(getSelectedInvoiceCycle('card-1', '2027-01-01', expenses, installments), {
    dueMonth: '2027-01-01',
    amount: 0,
    hasOverride: false,
  });
});

test('fatura aberta separa o saldo inicial e lançamentos posteriores sem dupla contagem', () => {
  const opening = { ...expenses[1], id: 'opening', amount: 1007.87, is_opening_summary: true,
    invoice_due_month: '2026-12-01' };
  const purchase = { ...expenses[0], id: 'new-purchase', amount: 1695.53, installment_count: 1 };
  const rows = [
    { ...installments[3], id: 'open', expense_id: opening.id, due_month: '2026-12-01', amount: 1007.87 },
    { ...installments[0], id: 'new', expense_id: purchase.id, due_month: '2026-12-01', amount: 1695.53 },
  ];
  assert.deepEqual(getInvoiceOpeningBreakdown(card.id, '2026-12-01', [opening,purchase], rows), {
    opening: 1007.87,
    subsequent: 1695.53,
    current: 2703.4,
  });
  const covered = { ...rows[1], opening_invoice_id: opening.id };
  assert.deepEqual(getInvoiceOpeningBreakdown(card.id, '2026-12-01', [opening,purchase], [rows[0], covered]), {
    opening: 1007.87,
    subsequent: 0,
    current: 1007.87,
  });
});

test('override regular continua estático, sem ser tratado como saldo inicial dinâmico', () => {
  assert.equal(getInvoiceOpeningBreakdown(card.id, '2026-10-01', expenses, installments), null);
});

test('crédito de R$ 86 não é somado como gasto no alerta de divergência de fatura',()=>{
  const id='bradesco-test';
  const purchase = {...expenses[0],id:'debit',card_id:id,amount:3078.90};
  const credit = {...expenses[0],id:'credit',card_id:id,amount:86,is_invoice_credit:true};
  const dues=[
    {...installments[0],id:'b-debit',expense_id:purchase.id,due_month:'2026-12-01',amount:3078.90},
    {...installments[0],id:'b-credit',expense_id:credit.id,due_month:'2026-12-01',amount:86},
  ];
  const registered=Math.round(getSelectedInvoiceCycle(id,'2026-12-01',[purchase,credit],dues).amount*100);
  const lastBankFact=Math.round(2930.88*100);
  assert.equal(registered,299290);
  assert.equal(registered-lastBankFact,6202);
  assert.notEqual(316490-lastBankFact,6202, 'somar crédito como compra falseia a divergência');
});
