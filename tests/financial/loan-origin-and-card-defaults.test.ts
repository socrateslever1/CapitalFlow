import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mapFormToLoan } from '../../features/loans/domain/loanForm.mapper';
import type { LoanFormState } from '../../features/loans/domain/loanForm.mapper';

const buildBaseForm = (overrides: Partial<LoanFormState> = {}): LoanFormState => ({
  clientId: 'client-1',
  debtorName: 'Deyse de Andrade Vieira',
  debtorPhone: '92999999999',
  debtorDocument: '',
  debtorAddress: '',
  sourceId: 'source-card-nu',
  fundingAllocations: [{ sourceId: 'source-card-nu', amount: '700' }],
  preferredPaymentMethod: 'PIX' as any,
  pixKey: '',
  principal: '700',
  interestRate: '0',
  finePercent: '2',
  dailyInterestPercent: '1',
  billingCycle: 'INSTALLMENT_FIXED',
  notes: '',
  guaranteeDescription: '',
  startDate: '2026-11-17',
  fundingTotalPayable: '734.93',
  fundingInstallmentsCount: '10',
  fundingCalculationMode: 'TOTAL',
  customerMarginPercent: '30',
  fundingPaymentMethod: 'CREDIT_CARD',
  ...overrides,
});

test('empréstimo parcelado para cliente no cartão usa 1 parcela à vista no cartão por padrão', () => {
  const loan = mapFormToLoan(
    buildBaseForm(),
    '10',
    null,
    [],
    [],
    [],
    'profile-1',
    '2026-12-17'
  );

  // Cliente tem 10 parcelas no contrato
  assert.equal(loan.installments.length, 10);
  // Compra no cartão deve ser à vista (1x) por padrão, sem confundir com as 10x do cliente
  assert.equal((loan as any).cardPurchaseInstallmentsCount, 1);
  assert.equal((loan.policiesSnapshot as any)?.cardPurchaseInstallmentsCount, 1);
});

test('somente modo explícito de parcelamento na origem gera várias parcelas no cartão', () => {
  const loan = mapFormToLoan(
    buildBaseForm({
      cardOriginInstallmentMode: 'INSTALLMENTS',
      cardPurchaseInstallmentsCount: '4',
    } as any),
    '10',
    null,
    [],
    [],
    [],
    'profile-1',
    '2026-12-17'
  );

  assert.equal(loan.installments.length, 10);
  assert.equal((loan as any).cardPurchaseInstallmentsCount, 4);
  assert.equal((loan.policiesSnapshot as any)?.cardPurchaseInstallmentsCount, 4);
});

test('empréstimo mensal comum com fonte cartão mantém método CREDIT_CARD e default de 1x', () => {
  const formSource = readFileSync('features/loans/hooks/useLoanForm.ts', 'utf8');
  const sectionSource = readFileSync('components/forms/LoanFormFinancialSection.tsx', 'utf8');

  // Default inicial de fundingInstallmentsCount no useLoanForm não pode ser '10'
  assert.doesNotMatch(formSource, /fundingInstallmentsCount:\s*'10'/);
  assert.doesNotMatch(sectionSource, /fundingInstallmentsCount:\s*formData\.fundingInstallmentsCount\s*\|\|\s*'10'/);

  // Criação com múltiplas fontes (composição conta + cartão) habilitada
  assert.match(sectionSource, /const MULTI_SOURCE_CREATION_ENABLED = true;/);
});

test('contracts.service suporta composição explícita de fontes via RPC atômica e respeita origem cartão fora de INSTALLMENT_FIXED', () => {
  const contractsSource = readFileSync('services/contracts.service.ts', 'utf8');
  assert.match(contractsSource, /finalize_loan_funding_allocations_v1/);
  assert.match(contractsSource, /isCardOnlySource/);
});
