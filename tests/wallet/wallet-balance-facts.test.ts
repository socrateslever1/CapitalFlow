import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWalletBalanceFacts } from '../../components/wallet/walletBalanceDomain';

test('mantém zero real diferente de valor financeiro desconhecido', () => {
  const facts = buildWalletBalanceFacts({
    effectiveBalance: 0,
    openingBalance: null,
    projectedBalance: 125.5,
    importedBalance: null,
    reconciledBalance: 0,
    pendingBalance: 40,
  });

  assert.equal(facts.effective.amount, 0);
  assert.equal(facts.effective.state, 'EFFECTIVE');
  assert.equal(facts.opening.amount, null);
  assert.equal(facts.opening.state, 'UNKNOWN');
  assert.equal(facts.projected.amount, 125.5);
  assert.equal(facts.projected.state, 'PROJECTED');
  assert.equal(facts.reconciled.amount, 0);
  assert.equal(facts.reconciled.state, 'RECONCILED');
  assert.equal(facts.imported.amount, null);
  assert.equal(facts.imported.state, 'UNKNOWN');
  assert.equal(facts.pending.amount, 40);
  assert.equal(facts.pending.state, 'PENDING');
});

test('normaliza valores inválidos como desconhecidos, sem inventar saldo zero', () => {
  const facts = buildWalletBalanceFacts({
    effectiveBalance: Number.NaN,
    openingBalance: undefined,
    projectedBalance: Number.POSITIVE_INFINITY,
    importedBalance: Number.NaN,
    reconciledBalance: undefined,
    pendingBalance: -10,
  });

  assert.equal(facts.effective.amount, null);
  assert.equal(facts.effective.state, 'UNKNOWN');
  assert.equal(facts.projected.amount, null);
  assert.equal(facts.projected.state, 'UNKNOWN');
  assert.equal(facts.pending.amount, 0);
  assert.equal(facts.pending.state, 'PENDING');
});
