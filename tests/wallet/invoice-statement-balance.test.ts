import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateWalletBalance } from '../../components/wallet/walletBalanceDomain';
import { getCardInvoiceEntries } from '../../components/wallet/invoiceStatementDomain';

const detail = readFileSync('components/wallet/CardDetailModal.tsx', 'utf8');
const page = readFileSync('pages/PersonalWalletPage.tsx', 'utf8');
const balancePanel = readFileSync('components/wallet/WalletBalanceOverview.tsx', 'utf8');

test('mantém intactos os blocos protegidos do detalhe do cartão', () => {
  assert.match(detail, /<VirtualCreditCard card=\{card\} interactive=\{true\}/);
  assert.match(detail, /Utilização do Limite/);
  assert.match(detail, /Limite Total/);
  assert.match(detail, /Fatura Atual/);
  assert.match(detail, /Importar PDF da fatura para conferência/);
});

test('adiciona o extrato da fatura depois da importação sem inseri-lo no cabeçalho', () => {
  assert.match(detail, /CardInvoiceStatement/);
  assert.ok(detail.indexOf('WalletStatementImport') < detail.lastIndexOf('CardInvoiceStatement'));
  assert.ok(detail.indexOf('Scrollable Content') < detail.lastIndexOf('CardInvoiceStatement'));
});

test('adiciona o balanço geral consolidado sem substituir liquidez e compromissos', () => {
  assert.match(page, /Liquidez e compromissos/);
  assert.match(page, /WalletBalanceOverview/);
  assert.match(balancePanel, /Balanço Geral da Carteira/);
});

test('calcula recursos pendentes, passivos do mês e saldo projetado sem dupla contagem', () => {
  const result = calculateWalletBalance({
    accounts: [{ id: 'a', nickname: 'Conta', bank_name: 'Banco', account_type: 'CHECKING', balance: 2000 }],
    recurringIncomes: [
      { id: 'r1', user_id: 'u', description: 'Salário', category: 'Renda', amount: 3000, receipt_day: 5, destination_account_id: 'a', active: true, created_at: '' },
      { id: 'r2', user_id: 'u', description: 'Aluguel', category: 'Renda', amount: 500, receipt_day: 10, destination_account_id: 'a', active: true, created_at: '' },
    ],
    receivedIncomeIds: new Set(['r1']),
    openCardInvoices: 800,
    payables: [
      { id: 'p1', creditor_name: 'Fornecedor', creditor_type: 'COMPANY', description: 'Serviço', amount: 300, total_amount: 300, outstanding_balance: 300, due_date: '2026-10-20', status: 'PENDING', interest_rate: 0, fine_percent: 0, created_at: '' },
      { id: 'p2', creditor_name: 'Outro', creditor_type: 'PERSON', description: 'Futuro', amount: 900, total_amount: 900, outstanding_balance: 900, due_date: '2026-11-20', status: 'PENDING', interest_rate: 0, fine_percent: 0, created_at: '' },
    ],
    month: '2026-10',
  });
  assert.equal(result.pendingRecurringIncome, 500);
  assert.equal(result.totalResources, 2500);
  assert.equal(result.monthPayables, 300);
  assert.equal(result.totalLiabilities, 1100);
  assert.equal(result.projectedBalance, 1400);
});

test('extrato inclui somente parcelas pendentes do cartão e da fatura selecionados', () => {
  const expense = { id: 'e1', description: 'Compra', amount: 200, category: 'Compras', expense_date: '2026-10-10', due_date: '2026-10-20', status: 'PENDING', installment_count: 2, card_id: 'c1' };
  const entries = getCardInvoiceEntries('c1', '2026-10-01', [expense], [
    { id: 'i1', expense_id: 'e1', installment_number: 1, due_month: '2026-10-01', amount: 100, paid_amount: 0, status: 'PENDING' as const },
    { id: 'i2', expense_id: 'e1', installment_number: 2, due_month: '2026-11-01', amount: 100, paid_amount: 0, status: 'PENDING' as const },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.installment.id, 'i1');
});
