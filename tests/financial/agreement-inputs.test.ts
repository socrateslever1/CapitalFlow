import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgreementBreakdown, parseAgreementInteger, parseAgreementMoney, parseAgreementRate } from '../../features/agreements/logic/agreementInputs';
import { simulateAgreement } from '../../features/agreements/logic/calculations';

test('campos em branco não começam com zero e não são convertidos em valor negociado', () => {
  assert.equal(parseAgreementMoney(''), null);
  assert.equal(parseAgreementInteger('', 60), null);
  assert.equal(parseAgreementRate(''), null);
});

test('interpreta formatos brasileiros, centavos e números internacionais simples', () => {
  for (const input of ['1.000,00', '1000,00', '1000.00', '1.000', '0001000,00']) {
    assert.equal(parseAgreementMoney(input), 1000, input);
  }
  assert.equal(parseAgreementMoney('200,15'), 200.15);
  assert.equal(parseAgreementMoney('0,01'), 0.01);
  assert.equal(parseAgreementMoney('2.860,00'), 2860);
  for (const invalid of ['2.860.00', '200abc', '-10', '1,000,00', '10,999', 'Infinity']) {
    assert.equal(parseAgreementMoney(invalid), null, invalid);
  }
});

test('não permite parcelas fracionárias nem quantidades superiores ao limite', () => {
  assert.equal(parseAgreementInteger('5', 60), 5);
  assert.equal(parseAgreementInteger('5,2', 60), null);
  assert.equal(parseAgreementInteger('61', 60), null);
  assert.equal(parseAgreementRate('2,5'), 2.5);
});

test('2860 de dívida, 1000 de principal, 5 vezes 200: dispensa encargos sem reduzir principal', () => {
  const amounts = [200,200,200,200,200];
  const summary = buildAgreementBreakdown(2860, 1000, amounts.reduce((a,b)=>a+b,0), 0);
  assert.deepEqual(summary, {
    agreedTotal: 1000,
    waivedCharges: 1860,
    reducedPrincipal: 0,
    totalReduction: 1860,
    exceedsPrincipal: false,
  });
});

test('se o novo total for menor que o principal, identifica abatimento adicional', () => {
  const summary = buildAgreementBreakdown(2860, 1250, 1000, 0);
  assert.equal(summary.waivedCharges, 1610);
  assert.equal(summary.reducedPrincipal, 250);
  assert.equal(summary.totalReduction, 1860);
});

test('motor cria exatamente cinco parcelas de R$ 200 no acordo somente de capital', () => {
  const result = simulateAgreement({
    totalDebt: 2860,
    baseDebtForAgreement: 1000,
    type: 'PARCELADO_SEM_JUROS',
    installmentsCount: 5,
    installmentValue: 200,
    calculationMode: 'BY_VALUE_AND_COUNT',
    interestRate: 0,
    firstDueDate: '2026-11-03',
    frequency: 'MONTHLY',
  });
  assert.equal(result.negotiatedTotal, 1000);
  assert.equal(result.installments.length, 5);
  assert.deepEqual(result.installments.map(row => row.amount), [200,200,200,200,200]);
  assert.equal(result.calculationResult, 'SAME');
});
