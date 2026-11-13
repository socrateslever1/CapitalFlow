import assert from 'node:assert/strict';
import test from 'node:test';
import { isExternalIncome } from '../../features/wallet/domain/walletIncomeHistory';

const entry = (id: string, description: string, category: string, amount: number,
  operation_type = 'INCOME', operation_date = '2026-11-05') =>
  ({ id, description, category, amount, operation_type, operation_date });

test('saldo inicial, estornos e correção de saldo não são receitas disponíveis', () => {
  const operations = [
    entry('opening', 'Saldo inicial da conta', 'Saldo inicial', 1004.98),
    entry('refund', 'Estorno: Contas', 'Estorno de lançamento', 59.26),
    entry('adjustment', 'Reajuste de saldo bancário', 'Ajuste de Saldo', 408.41),
  ];
  assert(operations.every(item => !isExternalIncome(item, operations)));
});

test('transferência comprovada pelo mesmo valor e data não é receita nova', () => {
  const operations = [
    entry('received', 'Transferencia do Nu', 'Outras receitas', 162.06),
    entry('outgoing', 'Pagar contas', 'Aluguel', 162.06, 'TRANSFER'),
  ];
  assert.equal(isExternalIncome(operations[0], operations), false);
  assert.equal(isExternalIncome(entry('external', 'Serviço prestado', 'Outras receitas', 400), operations), true);
  assert.equal(isExternalIncome(entry('different', 'Transferência externa', 'Outras receitas', 180), operations), true);
});

test('lançamento anulado e operação compensatória não entram no histórico de receitas', () => {
  const original = {
    ...entry('income-arilson', 'Arilson', 'Outras receitas', 2000, 'INCOME', '2026-11-13'),
    voided_at: '2026-11-13T04:31:48Z',
    voids_operation_id: null,
  };
  const compensation = {
    ...entry('refund-arilson', 'Estorno: Arilson', 'Estorno de lançamento', 2000, 'INCOME', '2026-11-13'),
    voided_at: '2026-11-13T04:31:48Z',
    voids_operation_id: 'income-arilson',
  };
  const active = entry('new-arilson', 'Arilson', 'Outras receitas', 2000, 'INCOME', '2026-11-06');
  const operations = [original, compensation, active];
  const total = operations
    .filter(operation => isExternalIncome(operation, operations))
    .reduce((sum, operation) => sum + operation.amount, 0);
  assert.equal(total, 2000);
  assert.equal(isExternalIncome(original, operations), false);
  assert.equal(isExternalIncome(compensation, operations), false);
});
