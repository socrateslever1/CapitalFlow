import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardStats } from '../../domain/dashboard/stats';

const source = (id: string, name: string, archived_at?: string | null) => ({ id, name, archived_at });

const loanWithLedger = (sourceId: string) => ({
  id: 'loan-1',
  sourceId: 'operational-source',
  principal: 100,
  totalToReceive: 120,
  interestRate: 20,
  status: 'ATIVO',
  isArchived: false,
  installments: [{
    id: 'inst-1',
    scheduledPrincipal: 100,
    scheduledInterest: 20,
    principalRemaining: 100,
    interestRemaining: 20,
    status: 'PENDING',
  }],
  ledger: [{
    id: 'test-payment',
    sourceId,
    installmentId: 'inst-1',
    type: 'PAYMENT_FULL',
    amount: 120,
    principalDelta: 100,
    interestDelta: 20,
    lateFeeDelta: 0,
    date: '2026-11-13',
  }],
});

test('transação de fonte de teste não altera saldo nem lucro projetado do contrato operacional', () => {
  const stats = buildDashboardStats(
    [loanWithLedger('test-source') as any],
    [source('test-source', 'Carteira Teste'), source('operational-source', 'Capital Operacional')],
    null,
  );

  assert.equal(stats.totalReceived, 0);
  assert.equal(stats.expectedProfit, 20);
  assert.equal(stats.totalLent, 100);
  assert.equal(stats.activeCount, 1);
});

test('fonte de teste arquivada continua excluindo seu ledger quando o registro permanece carregado', () => {
  const stats = buildDashboardStats(
    [loanWithLedger('archived-test-source') as any],
    [source('archived-test-source', 'Sandbox', '2026-11-01')],
    null,
  );

  assert.equal(stats.totalReceived, 0);
  assert.equal(stats.expectedProfit, 20);
});
