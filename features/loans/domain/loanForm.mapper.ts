import { addDaysUTC, normalizeCollectionDaysMode, toISODateOnlyUTC } from '../../../utils/dateHelpers';
import { CollectionDaysMode, Loan, LoanBillingModality, PaymentMethod, LoanDocument, Installment, LoanStatus } from '../../../types';
import { generateUUID } from '../../../utils/generators';
import { modalityRegistry } from '../../../domain/finance/modalities/registry';
import { parseCurrency } from '../../../utils/formatters';

/* =========================
   Trava de vencimento manual
   - Ao editar (initialData existe), preserva dueDate do banco
========================= */
function preserveExistingInstallmentFields(
  generated: Installment[],
  existing: Installment[],
  shouldPreserveDueDates: boolean
): Installment[] {
  if (!generated?.length || !existing?.length) return generated;

  const existingById = new Map<string, Installment>();
  const existingByNumber = new Map<number, Installment>();
  const toInstallmentNumber = (value: any, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const existingWithNumber = existing.map((inst, idx) => ({
    inst,
    num: toInstallmentNumber(
      (inst as any).number ??
      (inst as any).numero_parcela ??
      (inst as any).installmentNumber,
      idx + 1
    ),
  }));

  existingWithNumber.forEach(({ inst, num }) => {
    if ((inst as any)?.id) existingById.set((inst as any).id, inst);
    existingByNumber.set(num, inst);
  });

  const sortedExisting = [...existingWithNumber].sort((a, b) => a.num - b.num).map(item => item.inst);
  const existingNums = existingWithNumber.map(item => item.num).sort((a, b) => a - b);
  const isShiftedSameSchedule =
    existing.length === generated.length &&
    existingNums.length > 0 &&
    existingNums[0] !== 1 &&
    existingNums.every((num, idx) => idx === 0 || num === existingNums[idx - 1] + 1);

  return generated.map((g, idx) => {
    const gNum = toInstallmentNumber(
      (g as any).number ??
      (g as any).numero_parcela ??
      (g as any).installmentNumber,
      idx + 1
    );

    const prev =
      (isShiftedSameSchedule ? sortedExisting[idx] : null) ||
      ((g as any)?.id ? existingById.get((g as any).id) : null) ||
      existingByNumber.get(gNum);

    if (prev) {
      return {
        ...g,
        id: prev.id || g.id,
        dueDate: shouldPreserveDueDates && prev.dueDate ? prev.dueDate : g.dueDate,
        status: prev.status || g.status,
        paidDate: prev.paidDate || g.paidDate,
        paidAmount: prev.paidAmount ?? g.paidAmount,
        paidTotal: prev.paidTotal ?? g.paidTotal,
        paidPrincipal: prev.paidPrincipal ?? g.paidPrincipal,
        paidInterest: prev.paidInterest ?? g.paidInterest,
        paidLateFee: prev.paidLateFee ?? g.paidLateFee,
        logs: prev.logs?.length ? prev.logs : g.logs,
      };
    }
    return g;
  });
}
export interface LoanFormState {
  clientId: string;
  status?: LoanStatus; // Adicionado status para o formulário, pode ser opcional se for definido no backend ou com default
  debtorName: string;
  debtorPhone: string;
  debtorDocument: string;
  debtorAddress: string;
  sourceId: string;
  fundingAllocations?: Array<{ sourceId: string; amount: string }>;
  preferredPaymentMethod: PaymentMethod;
  pixKey: string;
  principal: string;
  interestRate: string;
  finePercent: string;
  dailyInterestPercent: string;
  billingCycle: LoanBillingModality;
  notes: string;
  guaranteeDescription: string;
  startDate: string;
  skipWeekends?: boolean;
  collectionDaysMode?: CollectionDaysMode;
  interestFreeInstallment?: boolean;
  // Campos de Funding
  fundingTotalPayable?: string;
  fundingProvider?: string;
  fundingFeePercent?: string;
  fundingCalculationMode?: 'TOTAL' | 'INSTALLMENT' | 'RATE';
  fundingInstallmentsCount?: string;
  fundingMonthlyRate?: string;
  fundingInstallmentValue?: string;
  customerMarginPercent?: string;
  fundingOperatorAbsorbsInterest?: boolean;
  fundingPaymentMethod?: 'CREDIT_CARD' | 'BANK_ACCOUNT_DEBIT';
}

function calculateFundingTotalFromRate(principal: number, monthlyRatePercent: number, installmentsCount: number): number {
  const n = Math.max(1, Math.floor(installmentsCount));
  const i = monthlyRatePercent / 100;
  const installment = i > 0
    ? principal * (i / (1 - Math.pow(1 + i, -n)))
    : principal / n;
  return parseFloat((installment * n).toFixed(2));
}

// Added profileId to signature to satisfy Loan type requirement
export const mapFormToLoan = (
  form: LoanFormState,
  fixedDuration: string,
  initialData: Loan | null,
  attachments: string[],
  documentPhotos: string[],
  customDocuments: LoanDocument[],
  profileId: string,
  manualFirstDueDate?: string
): Loan => {
  const principal = parseCurrency(form.principal);
  const interestFreeInstallment = form.billingCycle === 'INSTALLMENT_FIXED' && form.interestFreeInstallment === true;
  const rate = interestFreeInstallment ? 0 : parseCurrency(form.interestRate);
  const finePercent = parseCurrency(form.finePercent);
  const dailyInterestPercent = parseCurrency(form.dailyInterestPercent);

  // Cálculo do Custo de Captação (Cartão)
  let fundingTotalPayable = 0;
  let fundingCost = 0;
  const fundingInstallmentsCount = Math.max(0, Math.floor(parseCurrency(form.fundingInstallmentsCount || '')));
  const fundingMonthlyRate = parseCurrency(form.fundingMonthlyRate || '');
  const fundingInstallmentValue = parseCurrency(form.fundingInstallmentValue || '');
  const customerMarginPercent = interestFreeInstallment ? 0 : parseCurrency(form.customerMarginPercent || '');
  const fundingPaymentMethod = form.fundingPaymentMethod || 'CREDIT_CARD';
  const fundingCalculationMode = form.fundingCalculationMode || (form.fundingTotalPayable ? 'TOTAL' : 'RATE');

  if (form.fundingTotalPayable) {
    fundingTotalPayable = parseCurrency(form.fundingTotalPayable);
    if (fundingTotalPayable > principal) {
      fundingCost = fundingTotalPayable - principal;
    }
  }
  if (form.billingCycle === 'INSTALLMENT_FIXED' && fundingCalculationMode === 'RATE' && fundingInstallmentsCount > 0) {
    fundingTotalPayable = calculateFundingTotalFromRate(principal, fundingMonthlyRate, fundingInstallmentsCount);
    fundingCost = Math.max(0, fundingTotalPayable - principal);
  }
  if (form.billingCycle === 'INSTALLMENT_FIXED' && fundingCalculationMode === 'INSTALLMENT' && fundingInstallmentsCount > 0) {
    fundingTotalPayable = parseFloat((fundingInstallmentValue * fundingInstallmentsCount).toFixed(2));
    fundingCost = Math.max(0, fundingTotalPayable - principal);
  }
  if (form.billingCycle === 'INSTALLMENT_FIXED' && fundingPaymentMethod === 'BANK_ACCOUNT_DEBIT') {
    fundingTotalPayable = principal;
    fundingCost = 0;
  }

  const collectionDaysMode = normalizeCollectionDaysMode(form.collectionDaysMode, !!form.skipWeekends);

  // --- GERAÇÃO VIA REGISTRY ---
  const strategy = modalityRegistry.get(form.billingCycle);

  const { installments: generatedInstallments, totalToReceive } = strategy.generateInstallments({
    principal,
    rate,
    startDate: form.startDate,
    fixedDuration,
    fundingTotalPayable,
    fundingInstallmentsCount,
    fundingMonthlyRate,
    fundingInstallmentValue,
    fundingCalculationMode,
    customerMarginPercent,
    operatorAbsorbsInterest: interestFreeInstallment || fundingPaymentMethod === 'BANK_ACCOUNT_DEBIT' ? true : form.fundingOperatorAbsorbsInterest,
    interestFreeInstallment,
    initialData: {
      ...initialData,
      skipWeekends: collectionDaysMode === 'SKIP_WEEKEND',
      collectionDaysMode
    }
  });

  const startDateChanged = initialData && initialData.startDate !== form.startDate;
  const firstDueDateChanged = initialData && initialData.installments?.[0] && manualFirstDueDate && initialData.installments[0].dueDate !== manualFirstDueDate;

  const shouldPreserveDueDates = !startDateChanged && !firstDueDateChanged;

  // Vencimento informado vale na criação e na edição. Propaga o deslocamento
  // para as demais parcelas sem reescrever pagamento histórico.
  let adjustedGeneratedInstallments = generatedInstallments;
  if (generatedInstallments[0] && manualFirstDueDate && (!initialData || firstDueDateChanged || startDateChanged)) {
    const shiftDays = Math.round((Date.parse(manualFirstDueDate) - Date.parse(generatedInstallments[0].dueDate)) / 86400000);
    adjustedGeneratedInstallments = generatedInstallments.map((installment, index) => ({
      ...installment,
      dueDate: index === 0 ? manualFirstDueDate : toISODateOnlyUTC(addDaysUTC(installment.dueDate, shiftDays))
    }));
  }

  // ✅ TRAVA DE DADOS ANTERIORES: Mapeia IDs e opcionalmente preserva dueDates
  const finalInstallments =
    initialData?.installments?.length
      ? preserveExistingInstallmentFields(adjustedGeneratedInstallments, initialData.installments, shouldPreserveDueDates)
      : adjustedGeneratedInstallments;

  return {
    id: initialData?.id || generateUUID(),
    // Added profile_id to satisfy required property in Loan interface
    profile_id: profileId,

    clientId: form.clientId,
    debtorName: form.debtorName,
    debtorPhone: form.debtorPhone,
    debtorDocument: form.debtorDocument,
    debtorAddress: form.debtorAddress,

    sourceId: form.sourceId,
    fundingAllocations: (form.fundingAllocations || []).map((allocation, _, allocations) => ({
      sourceId: allocation.sourceId,
      amount: allocations.length === 1 ? principal : parseCurrency(allocation.amount),
    })),
    preferredPaymentMethod: form.preferredPaymentMethod,
    pixKey: form.pixKey,

    principal,
    interestRate: rate,
    finePercent,
    dailyInterestPercent,

    // Mapeamento de Funding
    fundingTotalPayable: fundingTotalPayable || undefined,
    fundingCost: fundingCost || undefined,
    fundingProvider: form.fundingProvider || undefined,
    fundingFeePercent: parseCurrency(form.fundingFeePercent || '') || undefined,
    fundingCalculationMode,
    fundingInstallmentsCount: fundingInstallmentsCount || undefined,
    fundingMonthlyRate: fundingMonthlyRate || undefined,
    fundingInstallmentValue: fundingInstallmentsCount > 0 && fundingTotalPayable > 0 ? (fundingCalculationMode === 'INSTALLMENT' ? fundingInstallmentValue : parseFloat((fundingTotalPayable / fundingInstallmentsCount).toFixed(2))) : undefined,
    customerMarginPercent: form.billingCycle === 'INSTALLMENT_FIXED' ? customerMarginPercent : undefined,
    customerInstallmentValue: form.billingCycle === 'INSTALLMENT_FIXED' ? generatedInstallments[0]?.amount : undefined,
    customerTotalPayable: form.billingCycle === 'INSTALLMENT_FIXED' ? totalToReceive : undefined,
    fundingOperatorAbsorbsInterest: form.billingCycle === 'INSTALLMENT_FIXED' ? (interestFreeInstallment ? true : form.fundingOperatorAbsorbsInterest) : undefined,
    fundingPaymentMethod: form.billingCycle === 'INSTALLMENT_FIXED' ? fundingPaymentMethod : undefined,

    billingCycle: form.billingCycle,
    amortizationType: 'JUROS',
    policiesSnapshot: {
      interestRate: rate,
      finePercent,
      dailyInterestPercent,
      collectionDaysMode,
      interestFreeInstallment,
      fundingPaymentMethod
    },

    startDate: form.startDate,

    // ✅ aqui entra a lista final (preservada quando editando)
    installments: finalInstallments,
    totalToReceive,

    ledger: initialData?.ledger || [],
    paymentSignals: initialData?.paymentSignals || [],
    notes: form.notes,
    guaranteeDescription: form.guaranteeDescription,

    attachments,
    documentPhotos,
    customDocuments,

    isArchived: initialData?.isArchived || false,
    skipWeekends: collectionDaysMode === 'SKIP_WEEKEND',
    collectionDaysMode,
    interestFreeInstallment,
    status: form.status || LoanStatus.PENDING // Atribuir status, usando o do formulário ou PENDING como default
  };
};
