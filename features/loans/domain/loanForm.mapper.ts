import { Loan, LoanBillingModality, PaymentMethod, LoanDocument, Installment, LoanStatus } from '../../../types';
import { generateUUID } from '../../../utils/generators';
import { modalityRegistry } from '../../../domain/finance/modalities/registry';
import { parseCurrency } from '../../../utils/formatters';

/* =========================
   Trava de vencimento manual
   - Ao editar (initialData existe), preserva dueDate do banco
========================= */
function preserveExistingDueDates(
  generated: Installment[],
  existing: Installment[]
): Installment[] {
  if (!generated?.length || !existing?.length) return generated;

  const existingById = new Map<string, Installment>();
  const existingByNumber = new Map<number, Installment>();

  existing.forEach((e, idx) => {
    if ((e as any)?.id) existingById.set((e as any).id, e);

    const num =
      (e as any).number ??
      (e as any).numero_parcela ??
      (e as any).installmentNumber ??
      idx + 1;

    if (typeof num === 'number') existingByNumber.set(num, e);
  });

  return generated.map((g, idx) => {
    const gNum =
      (g as any).number ??
      (g as any).numero_parcela ??
      (g as any).installmentNumber ??
      idx + 1;

    const prev =
      ((g as any)?.id ? existingById.get((g as any).id) : null) ||
      (typeof gNum === 'number' ? existingByNumber.get(gNum) : null);

    if (prev?.dueDate) {
      return { ...g, dueDate: prev.dueDate };
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
}

// Added profileId to signature to satisfy Loan type requirement
export const mapFormToLoan = (
  form: LoanFormState,
  fixedDuration: string,
  initialData: Loan | null,
  attachments: string[],
  documentPhotos: string[],
  customDocuments: LoanDocument[],
  profileId: string
): Loan => {
  const principal = parseCurrency(form.principal);
  const rate = parseCurrency(form.interestRate);

  // Cálculo do Custo de Captação (Cartão)
  let fundingTotalPayable = 0;
  let fundingCost = 0;

  if (form.fundingTotalPayable) {
    fundingTotalPayable = parseCurrency(form.fundingTotalPayable);
    if (fundingTotalPayable > principal) {
      fundingCost = fundingTotalPayable - principal;
    }
  }

  // --- GERAÇÃO VIA REGISTRY ---
  const strategy = modalityRegistry.get(form.billingCycle);

  const { installments: generatedInstallments, totalToReceive } = strategy.generateInstallments({
    principal,
    rate,
    startDate: form.startDate,
    fixedDuration,
    initialData: {
      ...initialData,
      skipWeekends: form.skipWeekends
    }
  });

  // ✅ TRAVA: se está editando e já existem parcelas, preserve o dueDate do banco
  const finalInstallments =
    initialData?.installments?.length
      ? preserveExistingDueDates(generatedInstallments, initialData.installments)
      : generatedInstallments;

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