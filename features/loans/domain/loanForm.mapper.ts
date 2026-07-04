import { Loan, LoanBillingModality, PaymentMethod, LoanDocument, Installment, LoanStatus } from '../../../types';
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
<<<<<<< HEAD
        id: prev.id || g.id,
        dueDate: prev.dueDate || g.dueDate,
        status: prev.status || g.status,
        paidDate: prev.paidDate || g.paidDate,
        paidAmount: prev.paidAmount ?? g.paidAmount,
        paidTotal: prev.paidTotal ?? g.paidTotal,
        paidPrincipal: prev.paidPrincipal ?? g.paidPrincipal,
        paidInterest: prev.paidInterest ?? g.paidInterest,
        paidLateFee: prev.paidLateFee ?? g.paidLateFee,
        logs: prev.logs?.length ? prev.logs : g.logs,
=======
        id: prev.id, // ✅ Preserva o ID original para evitar duplicados no Supabase (upsert)
        dueDate: shouldPreserveDueDates && prev.dueDate ? prev.dueDate : g.dueDate
>>>>>>> f53f97feddc390165301c4f85523b4f1416a7f10
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
  // Campos de Funding
  fundingTotalPayable?: string;
  fundingProvider?: string;
  fundingFeePercent?: string;
  fundingCalculationMode?: 'TOTAL' | 'RATE';
  fundingInstallmentsCount?: string;
  fundingMonthlyRate?: string;
  customerMarginPercent?: string;
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
  const rate = parseCurrency(form.interestRate);

  // Cálculo do Custo de Captação (Cartão)
  let fundingTotalPayable = 0;
  let fundingCost = 0;
  const fundingInstallmentsCount = Math.max(0, Math.floor(parseCurrency(form.fundingInstallmentsCount || '')));
  const fundingMonthlyRate = parseCurrency(form.fundingMonthlyRate || '');
  const customerMarginPercent = parseCurrency(form.customerMarginPercent || '');
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
    fundingCalculationMode,
    customerMarginPercent,
    initialData: {
      ...initialData,
      skipWeekends: form.skipWeekends
    }
  });

  const startDateChanged = initialData && initialData.startDate !== form.startDate;
  const firstDueDateChanged = initialData && initialData.installments?.[0] && manualFirstDueDate && initialData.installments[0].dueDate !== manualFirstDueDate;

  const shouldPreserveDueDates = !startDateChanged && !firstDueDateChanged;

  // Se a primeira data de vencimento manual foi informada e mudou/recalculou, aplicamos ela e propagamos o deslocamento nas parcelas geradas
  let adjustedGeneratedInstallments = generatedInstallments;
  if (adjustedGeneratedInstallments[0] && manualFirstDueDate && firstDueDateChanged && initialData?.installments?.[0]) {
    const originalFirst = new Date(initialData.installments[0].dueDate).getTime();
    const newFirst = new Date(manualFirstDueDate).getTime();
    const diffMs = newFirst - originalFirst;

    adjustedGeneratedInstallments = generatedInstallments.map((g, idx) => {
      if (idx === 0) return { ...g, dueDate: manualFirstDueDate };
      const currentDueDateMs = new Date(g.dueDate).getTime();
      const adjustedDate = new Date(currentDueDateMs + diffMs);
      return { ...g, dueDate: adjustedDate.toISOString().split('T')[0] };
    });
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
    preferredPaymentMethod: form.preferredPaymentMethod,
    pixKey: form.pixKey,

    principal,
    interestRate: rate,
    finePercent: parseCurrency(form.finePercent),
    dailyInterestPercent: parseCurrency(form.dailyInterestPercent),

    // Mapeamento de Funding
    fundingTotalPayable: fundingTotalPayable || undefined,
    fundingCost: fundingCost || undefined,
    fundingProvider: form.fundingProvider || undefined,
    fundingFeePercent: parseCurrency(form.fundingFeePercent || '') || undefined,
    fundingCalculationMode,
    fundingInstallmentsCount: fundingInstallmentsCount || undefined,
    fundingMonthlyRate: fundingMonthlyRate || undefined,
    fundingInstallmentValue: fundingInstallmentsCount > 0 && fundingTotalPayable > 0 ? parseFloat((fundingTotalPayable / fundingInstallmentsCount).toFixed(2)) : undefined,
    customerMarginPercent: form.billingCycle === 'INSTALLMENT_FIXED' ? customerMarginPercent : undefined,
    customerInstallmentValue: form.billingCycle === 'INSTALLMENT_FIXED' ? generatedInstallments[0]?.amount : undefined,
    customerTotalPayable: form.billingCycle === 'INSTALLMENT_FIXED' ? totalToReceive : undefined,

    billingCycle: form.billingCycle,
    amortizationType: 'JUROS',
    policiesSnapshot: {
      interestRate: rate,
      finePercent: parseCurrency(form.finePercent),
      dailyInterestPercent: parseCurrency(form.dailyInterestPercent)
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
    skipWeekends: form.skipWeekends,
    status: form.status || LoanStatus.PENDING // Atribuir status, usando o do formulário ou PENDING como default
  };
};
