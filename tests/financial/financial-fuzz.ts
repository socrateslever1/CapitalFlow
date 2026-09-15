import assert from 'node:assert/strict';
import { allocatePaymentFromBuckets, ZERO_BALANCE_THRESHOLD } from '../../domain/finance/calculations';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

let seed = 0x5f3759df;
const random = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff;
};

const randomMoney = (max: number) => money(random() * max);

for (let i = 0; i < 50000; i += 1) {
  const principal = randomMoney(100000);
  const interest = randomMoney(30000);
  const lateFee = randomMoney(10000);
  const due = money(principal + interest + lateFee);
  const paymentAmount = money(Math.max(0.01, random() * (due + 5000)));

  const result = allocatePaymentFromBuckets({ paymentAmount, principal, interest, lateFee });

  const distributed = money(
    result.paidPrincipal + result.paidInterest + result.paidLateFee + result.avGenerated,
  );
  const expectedRemaining = money(Math.max(0, due - Math.min(due, paymentAmount)));

  assert.equal(distributed, paymentAmount, `conservação falhou no caso ${i}`);
  assert.equal(money(result.remainingAfterPayment), expectedRemaining, `saldo restante falhou no caso ${i}`);

  assert.ok(result.paidPrincipal >= -ZERO_BALANCE_THRESHOLD, `principal negativo no caso ${i}`);
  assert.ok(result.paidInterest >= -ZERO_BALANCE_THRESHOLD, `juros negativos no caso ${i}`);
  assert.ok(result.paidLateFee >= -ZERO_BALANCE_THRESHOLD, `multa negativa no caso ${i}`);
  assert.ok(result.avGenerated >= -ZERO_BALANCE_THRESHOLD, `excedente negativo no caso ${i}`);

  assert.ok(result.paidInterest <= interest + ZERO_BALANCE_THRESHOLD, `juros acima do devido no caso ${i}`);
  assert.ok(result.paidLateFee <= lateFee + ZERO_BALANCE_THRESHOLD, `multa acima do devido no caso ${i}`);
  assert.ok(result.paidPrincipal <= principal + ZERO_BALANCE_THRESHOLD, `principal acima do devido no caso ${i}`);

  if (paymentAmount <= interest + ZERO_BALANCE_THRESHOLD) {
    assert.ok(result.paidPrincipal <= ZERO_BALANCE_THRESHOLD, `principal amortizado antes dos juros no caso ${i}`);
    assert.ok(result.paidLateFee <= ZERO_BALANCE_THRESHOLD, `multa paga antes de quitar juros no caso ${i}`);
  }

  if (paymentAmount <= interest + lateFee + ZERO_BALANCE_THRESHOLD) {
    assert.ok(result.paidPrincipal <= ZERO_BALANCE_THRESHOLD, `principal amortizado antes dos encargos no caso ${i}`);
  }
}

console.log('✓ 50.000 cenários financeiros determinísticos preservaram as invariantes.');
