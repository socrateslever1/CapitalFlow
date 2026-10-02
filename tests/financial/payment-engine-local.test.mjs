import assert from 'node:assert/strict';

class LocalFinancialStore {
  constructor() {
    this.installment = { principalRemaining: 1000, interestRemaining: 120, lateFeeAccrued: 30 };
    this.operations = [];
    this.idempotency = new Map();
    this.queue = Promise.resolve();
  }

  receive({ idempotencyKey, amount, failAfterPlanning = false }) {
    const execute = this.queue.then(async () => {
      const previous = this.idempotency.get(idempotencyKey);
      if (previous) return { ...previous, idempotentReplay: true };

      const before = structuredClone(this.installment);
      const total = before.principalRemaining + before.interestRemaining + before.lateFeeAccrued;
      if (amount <= 0 || amount > total) throw new Error('valor inválido');

      let remaining = amount;
      const interestPaid = Math.min(remaining, before.interestRemaining);
      remaining = Number((remaining - interestPaid).toFixed(2));
      const lateFeePaid = Math.min(remaining, before.lateFeeAccrued);
      remaining = Number((remaining - lateFeePaid).toFixed(2));
      const principalPaid = Math.min(remaining, before.principalRemaining);
      const after = {
        principalRemaining: Number((before.principalRemaining - principalPaid).toFixed(2)),
        interestRemaining: Number((before.interestRemaining - interestPaid).toFixed(2)),
        lateFeeAccrued: Number((before.lateFeeAccrued - lateFeePaid).toFixed(2)),
      };

      if (failAfterPlanning) throw new Error('falha simulada antes do commit');

      const result = { operationId: `op-${this.operations.length + 1}`, amount, before, after };
      this.installment = after;
      this.operations.push(result);
      this.idempotency.set(idempotencyKey, result);
      return result;
    });
    this.queue = execute.then(() => undefined, () => undefined);
    return execute;
  }
}

const idempotentStore = new LocalFinancialStore();
const first = await idempotentStore.receive({ idempotencyKey: 'same-key', amount: 200 });
const replay = await idempotentStore.receive({ idempotencyKey: 'same-key', amount: 200 });
assert.equal(idempotentStore.operations.length, 1, 'a mesma chave deve criar uma única movimentação');
assert.equal(replay.operationId, first.operationId, 'a repetição deve devolver a operação original');

const concurrentStore = new LocalFinancialStore();
const concurrentResults = await Promise.allSettled([
  concurrentStore.receive({ idempotencyKey: 'concurrent-a', amount: 700 }),
  concurrentStore.receive({ idempotencyKey: 'concurrent-b', amount: 700 }),
]);
assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1, 'apenas uma operação deve consumir o saldo disponível');
assert.equal(concurrentStore.operations.length, 1, 'concorrência não pode duplicar movimentação');
assert.ok(concurrentStore.installment.principalRemaining >= 0, 'principal não pode ficar negativo');
assert.ok(concurrentStore.installment.interestRemaining >= 0, 'juros não podem ficar negativos');
assert.ok(concurrentStore.installment.lateFeeAccrued >= 0, 'encargos não podem ficar negativos');

const rollbackStore = new LocalFinancialStore();
const rollbackBefore = structuredClone(rollbackStore.installment);
await assert.rejects(
  rollbackStore.receive({ idempotencyKey: 'rollback-key', amount: 200, failAfterPlanning: true }),
  /falha simulada/
);
assert.deepEqual(rollbackStore.installment, rollbackBefore, 'falha intermediária deve restaurar a parcela');
assert.equal(rollbackStore.operations.length, 0, 'falha intermediária não pode criar movimentação');
assert.equal(rollbackStore.idempotency.size, 0, 'falha intermediária não pode reservar a chave');

console.log('✓ idempotência local validada');
console.log('✓ concorrência local validada');
console.log('✓ rollback local validado');
