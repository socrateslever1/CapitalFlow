import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardStats } from '../../domain/dashboard/stats';
import { processInternalAICommand } from '../../services/internalAI.service';
import { businessMonthInManaus } from '../../utils/businessDate';

// Dados fictícios.
const today = `${businessMonthInManaus()}-05`;

const loan = (id: string, ledgerType: string) => ({
  id, debtorName: `Cliente ${id}`, sourceId: 'operational-source', principal: 100, totalToReceive: 120,
  interestRate: 20, status: 'ATIVO', isArchived: false,
  installments: [{ id: `${id}-i`, scheduledPrincipal: 100, scheduledInterest: 20, principalRemaining: 100, interestRemaining: 20, status: 'PENDING' }],
  ledger: [{ id: `${id}-l`, sourceId: 'operational-source', type: ledgerType, amount: 100, principalDelta: 0, interestDelta: 0, lateFeeDelta: 0, date: today }],
});

test('empréstimo inicial entra como saída no gráfico Evolução do mês', () => {
  const stats = buildDashboardStats([loan('a', 'LOAN_INITIAL') as any], [{ id: 'operational-source', name: 'Capital' }], null);
  const current = stats.lineChartData[stats.lineChartData.length - 1];
  assert.equal(current.Saidas, 100);
});

test('estatísticas expõem atrasados, exposição e concentração usadas pelo Auditor', () => {
  const stats = buildDashboardStats([loan('a', 'LOAN_INITIAL') as any, loan('b', 'LOAN_INITIAL') as any], [{ id: 'operational-source', name: 'Capital' }], null);
  assert.equal(stats.activeCount, 2);
  assert.equal(typeof stats.lateCount, 'number');
  assert.equal(stats.topDebtorsShare, 1, 'com 2 devedores, os 3 maiores somam todo o capital');
  assert.ok(Array.isArray(stats.topLateLoans));
});

test('Auditor usa os números recebidos e acusa concentração crítica com exposição acima de 50%', () => {
  const result = processInternalAICommand('Realize um Veredito de Auditoria Técnica sobre esta carteira.', {
    type: 'OPERATOR_AUDIT', totalLent: 48822.64, activeCount: 24, lateCount: 11, interestBalance: 0,
    totalAtRisk: 37600, exposureShare: 0.77, topDebtorsShare: 0.3, topLateLoans: [],
    monthFlow: { in: 7283.18, out: 3200 }, sourceLiquidity: 0,
  });
  const text = result.analysis || '';
  assert.match(text, /24 contrato\(s\) ativo\(s\)/);
  assert.match(text, /11 contrato\(s\) em atraso/);
  assert.match(text, /entradas de R\$\s?7\.283,18/);
  assert.match(text, /Concentração crítica: exposição ao risco de 77%/);
  assert.doesNotMatch(text, /Não há concentração crítica/);
});
