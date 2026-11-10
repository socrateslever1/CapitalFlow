import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { validateLoanForm } from '../../features/loans/domain/loanForm.validators';
import { normalizeOptionalCardFunding } from '../../features/loans/domain/optionalCardFunding';
import { mapFormToLoan, type LoanFormState } from '../../features/loans/domain/loanForm.mapper';
import type { CapitalSource } from '../../types';
import { calculateFundingSummary } from '../../domain/finance/fundingCost';

const source = (type: CapitalSource['type']): CapitalSource =>
  ({ id: 'card-source', name: 'Cartão teste', type, balance: 5000 } as CapitalSource);
const form = (overrides: Partial<LoanFormState> = {}): LoanFormState => ({
  clientId: 'test-client',
  debtorName: 'Cliente teste', debtorPhone: '92999999999',
  debtorDocument: '12345678909', debtorAddress: '', sourceId: 'card-source',
  preferredPaymentMethod: 'PIX', pixKey: '', principal: '200',
  interestRate: '30', finePercent: '2', dailyInterestPercent: '1',
  billingCycle: 'MONTHLY', notes: '', guaranteeDescription: '',
  startDate: '2026-11-10', fundingTotalPayable: '',
  fundingFeePercent: '', fundingPaymentMethod: 'CREDIT_CARD',
  fundingCalculationMode: 'TOTAL',
  ...overrides,
});
const map = (value: LoanFormState) =>
  mapFormToLoan(value, '30', null, [], [], [], '00000000-0000-4000-8000-000000000001');

test('card without operator fees passes validation and persists explicit zero cost', () => {
  const input = form();
  assert.equal(validateLoanForm(input, [source('CARD')], false).isValid, true);
  const normalized = normalizeOptionalCardFunding(input, 'CARD', false);
  assert.equal(input.fundingTotalPayable, '', 'normalization is immutable');
  assert.equal(normalized.fundingTotalPayable, '200.00');
  assert.equal(normalized.fundingFeePercent, '0');
  const loan = map(normalized);
  assert.equal(loan.fundingTotalPayable, 200);
  assert.equal(loan.fundingCost, 0);
  assert.equal(loan.fundingFeePercent, 0);
  assert.equal(loan.principal, 200);
  assert.equal(loan.totalToReceive, 260);
  assert.equal(calculateFundingSummary({
    principal: loan.principal, customerTotal: loan.totalToReceive,
    fundingTotal: loan.fundingTotalPayable, fundingCost: loan.fundingCost,
  }).netProfit, 60);
});
test('fees explicitly informed remain auditable without changing debtor interest', () => {
  const input = form({ fundingTotalPayable: '209.98', fundingFeePercent: '4.99' });
  assert.equal(validateLoanForm(input, [source('CARD')], false).isValid, true);
  const normalized = normalizeOptionalCardFunding(input, 'CARD', false);
  assert.equal(normalized, input);
  const loan = map(normalized);
  assert.equal(Math.round(Number(loan.fundingCost) * 100), 998);
  assert.equal(loan.fundingTotalPayable, 209.98);
  assert.equal(loan.totalToReceive, 260);
});
test('invalid card total remains rejected and no-cost normalization does not erase user input', () => {
  for (const total of ['199.99', '0', '-2']) {
    assert.equal(validateLoanForm(form({ fundingTotalPayable: total }), [source('CARD')], false).isValid, false);
  }
  const input = form({ fundingTotalPayable: '199.99' });
  assert.equal(normalizeOptionalCardFunding(input, 'CARD', false), input);
});
test('no-cost funding supports mixed sources but never changes accounts or edits', () => {
  const input = form();
  assert.equal(normalizeOptionalCardFunding(input, 'MISTO', false), input);
  assert.equal(normalizeOptionalCardFunding(input, 'CASH', false), input);
  assert.equal(normalizeOptionalCardFunding(input, 'CARD', true), input);
});
test('fixed card installments without card fees allow empty total or empty rate', () => {
  const fixed = form({
    billingCycle: 'INSTALLMENT_FIXED',
    fundingInstallmentsCount: '2',
    customerMarginPercent: '30',
    fundingCalculationMode: 'TOTAL',
    fundingTotalPayable: '',
    fundingMonthlyRate: '',
  });
  assert.equal(validateLoanForm(fixed, [source('CARD')], false).isValid, true);
  const loan = map(fixed);
  assert.equal(loan.fundingTotalPayable, 200);
  assert.equal(loan.fundingCost, 0);
  assert.equal(loan.totalToReceive, 260);
  const rate = { ...fixed, fundingCalculationMode: 'RATE' as const };
  assert.equal(validateLoanForm(rate, [source('CARD')], false).isValid, true);
  assert.equal(map(rate).fundingCost, 0);
  const withFee = { ...fixed, fundingTotalPayable: '210' };
  assert.equal(map(withFee).fundingCost, 10);
});
test('financial UI does not mark optional card cost as required', () => {
  const section = readFileSync('components/forms/LoanFormFinancialSection.tsx', 'utf8');
  const fields = readFileSync('components/forms/LoanFundingCostFields.tsx', 'utf8');
  const submit = readFileSync('features/loans/hooks/useLoanForm.ts', 'utf8');
  assert.doesNotMatch(section, /required=\{!isEditing && selectedSource\?\.type === 'CARD'\}/);
  assert.doesNotMatch(fields, /required=\{required\}/);
  assert.match(fields, /Custo da operação \(R\$\) · opcional/);
  assert.match(submit, /normalizeOptionalCardFunding\(formData, selectedFundingSource\?\.type, !!initialData\)/);
});
