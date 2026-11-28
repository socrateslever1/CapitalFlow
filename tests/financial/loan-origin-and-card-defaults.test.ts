import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mapFormToLoan } from '../../features/loans/domain/loanForm.mapper';
import type { LoanFormState } from '../../features/loans/domain/loanForm.mapper';
import { checkLinkedCardFunding, usesSingleCardSource } from '../../features/loans/domain/cardFundingSource';
import { validateLoanForm } from '../../features/loans/domain/loanForm.validators';
import { formatContractSaveError } from '../../features/loans/domain/contractSaveError';

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

  // O serviço ainda bloqueia a criação por várias fontes; o formulário não oferece um caminho sem saída.
  assert.match(sectionSource, /const MULTI_SOURCE_CREATION_ENABLED = false;/);
});

test('contracts.service suporta composição explícita de fontes via RPC atômica e respeita origem cartão fora de INSTALLMENT_FIXED', () => {
  const contractsSource = readFileSync('services/contracts.service.ts', 'utf8');
  assert.match(contractsSource, /finalize_loan_funding_allocations_v1/);
  assert.match(contractsSource, /usesSingleCardSource/);
});

test('aviso de caixa não se aplica ao financiamento integral por cartão', () => {
  assert.equal(usesSingleCardSource('CARD', 'CREDIT_CARD', 1), true);
  assert.equal(usesSingleCardSource('CARD', undefined, 1), true);
  assert.equal(usesSingleCardSource('MISTO', 'CREDIT_CARD', 1), true);
  assert.equal(usesSingleCardSource('MISTO', 'BANK_ACCOUNT_DEBIT', 1), false);
  assert.equal(usesSingleCardSource('BANK', 'CREDIT_CARD', 1), false);
  assert.equal(usesSingleCardSource('CARD', 'CREDIT_CARD', 2), false);
  const formSource = readFileSync('features/loans/hooks/useLoanForm.ts', 'utf8');
  assert.match(formSource, /!cardFunded && !isTestSource\(selectedSource\)/);
});

test('fonte somente cartão não aceita débito em conta', () => {
  const form = buildBaseForm({ debtorDocument: '12345678909', fundingPaymentMethod: 'BANK_ACCOUNT_DEBIT' });
  const source = { id: form.sourceId, type: 'CARD', balance: 0 } as any;
  assert.match(validateLoanForm(form, [source], false).error || '', /fonte selecionada é um cartão/);
  assert.doesNotMatch(validateLoanForm({ ...form, fundingPaymentMethod: 'CREDIT_CARD' }, [source], false).error || '', /fonte selecionada é um cartão/);
});

test('formulário bloqueia composição por várias fontes antes da confirmação de caixa', () => {
  const form = buildBaseForm({ debtorDocument: '12345678909', fundingAllocations: [
    { sourceId: 'source-card-nu', amount: '300' },
    { sourceId: 'source-bank', amount: '400' },
  ] });
  assert.match(validateLoanForm(form, [], false).error || '', /composição por várias fontes está temporariamente indisponível/);
});

test('vínculo e crédito são conferidos antes de gravar um novo contrato no cartão', () => {
  const link = [{ target_kind: 'CARD', target_id: 'card-1' }];
  const card = { status: 'ACTIVE', credit_limit: 8177, used_limit: 6114.27 };
  assert.equal(checkLinkedCardFunding(link, card, 524.95), null);
  assert.equal(checkLinkedCardFunding([], card, 524.95), 'LINK');
  assert.equal(checkLinkedCardFunding([...link, ...link], card, 524.95), 'LINK');
  assert.equal(checkLinkedCardFunding(link, { ...card, status: 'BLOCKED' }, 524.95), 'CARD');
  assert.equal(checkLinkedCardFunding(link, card, 2062.74), 'LIMIT');
  assert.equal(formatContractSaveError(new Error('Crédito disponível insuficiente para o total financiado. Confira o limite do cartão.')),
    'Crédito disponível insuficiente para o total financiado. Confira o limite do cartão.');
  const serviceSource = readFileSync('services/contracts.service.ts', 'utf8');
  assert.match(serviceSource, /isCardFundedLoan && !existingCardLoan && !options\?\.skipTransaction/);
});

test('contrato já financiado exige confirmação documental, data e montante bancário coerentes',()=>{
  const good=buildBaseForm({
    debtorDocument:'12345678909',
    cardPurchaseAlreadyCharged:true,
    cardPurchaseChargeDate: new Date(Date.now()-86400000).toISOString().slice(0,10),
    cardPurchaseChargedAmount:'734,93',
    cardPurchaseBankReference:'RecargaPay 20/11 23:28',
  });
  const source={id:good.sourceId,type:'CARD',balance:0} as any;
  assert.equal(validateLoanForm(good,[source],false).isValid,true);
  assert.equal((mapFormToLoan(good,'10',null,[],[],[],'profile-1').policiesSnapshot as any).cardPurchaseAlreadyCharged,true);
  assert.equal((mapFormToLoan(good,'10',null,[],[],[],'profile-1').policiesSnapshot as any).cardPurchaseChargedAmount,'734.93');
  assert.match(validateLoanForm({...good,cardPurchaseChargedAmount:'735,00'},[source],false).error||'',/valor exato/);
  assert.match(validateLoanForm({...good,cardPurchaseBankReference:'PIX'},[source],false).error||'',/identificação da compra/);
  assert.match(validateLoanForm({...good,cardPurchaseChargeDate:'2029-01-01'},[source],false).error||'',/data válida/);
  assert.match(validateLoanForm({...good, fundingPaymentMethod:'BANK_ACCOUNT_DEBIT'},[source],false).error||'',/fonte selecionada é um cartão/);
});
test('apenas o modo histórico confirmado dispensa a trava local de limite',()=>{
  const text=readFileSync('services/contracts.service.ts','utf8');
  assert.match(text,/issue === 'LIMIT' && loan.policiesSnapshot\?\.cardPurchaseAlreadyCharged !== true/);
  assert.match(text,/if \(issue === 'LINK'\)/);
  assert.match(text,/if \(issue === 'CARD'\)/);
  const section=readFileSync('components/forms/LoanFormFinancialSection.tsx','utf8');
  assert.match(section,/Compra já realizada e cobrada pelo banco/);
  assert.match(section,/cardPurchaseChargedAmount/);
  assert.match(section,/cardPurchaseBankReference/);
  assert.match(section,/cardPurchaseChargeDate/);
});
