import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFundingSummary, readLoanFundingCost } from '../../domain/finance/fundingCost';

test('mensal com cartão: R$ 200, R$ 60 de juros e R$ 9,98 de custo', () => {
  assert.deepEqual(calculateFundingSummary({
    principal: 200, customerTotal: 260, fundingTotal: 209.98,
  }), {
    principal: 200, customerTotal: 260, fundingTotal: 209.98,
    fundingCost: 9.98, grossProfit: 60, netProfit: 50.02, netReturnPercent: 25.01,
  });
});

test('sem custo de financiamento preserva lucro bruto', () => {
  assert.equal(calculateFundingSummary({principal: 200, customerTotal:260}).netProfit, 60);
});

test('custo em reais pode ser informado sem alterar as parcelas do devedor', () => {
  const v = calculateFundingSummary({principal:200, customerTotal:260, fundingCost:9.98});
  assert.equal(v.fundingTotal,209.98);
  assert.equal(v.customerTotal,260);
});

test('financiamento misto admite prejuízo sem alterar principal', () => {
  const v = calculateFundingSummary({principal:200,customerTotal:210,fundingCost:25});
  assert.equal(v.netProfit,-15);
});

test('não aceita erros de valor e inconsistências', () => {
  for (const input of [
    {principal:200,customerTotal:260,fundingTotal:199},
    {principal:200,customerTotal:260,fundingTotal:209.98,fundingCost:7},
    {principal:0,customerTotal:0},
    {principal:-1,customerTotal:100},
    {principal:Number.NaN,customerTotal:100},
    {principal:200,customerTotal:Number.POSITIVE_INFINITY},
  ]) assert.throws(()=>calculateFundingSummary(input), RangeError);
});

test('histórico legado lê custo, sem somá-lo duas vezes', () => {
  assert.equal(readLoanFundingCost({principal:200,fundingTotalPayable:209.98,fundingCost:9.98}),9.98);
  assert.equal(readLoanFundingCost({principal:200,fundingTotalPayable:209.98}),9.98);
  assert.equal(readLoanFundingCost({principal:200,fundingTotalPayable:209.98,fundingCost:0}),9.98);
  assert.equal(readLoanFundingCost({principal:200}),0);
});
