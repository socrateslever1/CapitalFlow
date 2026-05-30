
// services/adapters/loanAdapter.ts
import { Agreement, AgreementInstallment, Installment, Loan, LoanStatus } from '../../types';
import { asArray, asNumber, asString, safeDateString } from '../../utils/safe';

/**
 * Normaliza o status do Contrato (Loan) para o enum do frontend.
 */
function normalizeLoanStatus(statusRaw: unknown): LoanStatus {
  const s = asString(statusRaw).toUpperCase().trim();
  if (!s) return LoanStatus.ATIVO;
  if (['ATIVO', 'ACTIVE', 'OPEN', 'ABERTO'].includes(s)) return LoanStatus.ATIVO;
  if (['EM_ACORDO', 'AGREEMENT', 'IN_AGREEMENT'].includes(s)) return LoanStatus.EM_ACORDO;
  if (['RENEGOCIADO', 'RENEGOTIATED'].includes(s)) return LoanStatus.RENEGOCIADO;
  if (['PAGO', 'PAID', 'QUITADO', 'FINALIZADO'].includes(s)) return LoanStatus.PAGO;
  if (['CANCELADO', 'CANCELLED'].includes(s)) return LoanStatus.CANCELADO;
  if (['ATRASADO', 'LATE', 'OVERDUE'].includes(s)) return LoanStatus.ATRASADO;
  return LoanStatus.ATIVO;
}

/**
 * Normaliza status de acordo (banco) para o padrão esperado pelo frontend.
 */
function normalizeAgreementStatus(statusRaw: unknown): 'ACTIVE' | 'PAID' | 'BROKEN' {
  const s = asString(statusRaw).toUpperCase().trim();
  if (!s) return 'ACTIVE';
  if (['PAGO', 'PAID', 'QUITADO', 'FINALIZADO', 'SETTLED'].includes(s)) return 'PAID';
  if (['BROKEN', 'QUEBRADO', 'CANCELADO', 'INATIVO', 'QUEBROU'].includes(s)) return 'BROKEN';
  if (['ATIVO', 'ACTIVE', 'ABERTO', 'OPEN'].includes(s)) return 'ACTIVE';
  return 'ACTIVE';
}

/**
 * Normaliza status de parcela de acordo (banco) para padrão do frontend.
 */
function normalizeAgreementInstallmentStatus(
  statusRaw: unknown
): 'PENDING' | 'PAID' | 'LATE' | 'PARTIAL' {
  const s = asString(statusRaw).toUpperCase().trim();
  if (!s) return 'PENDING';
  if (s === 'PENDENTE') return 'PENDING';
  if (s === 'PAGO') return 'PAID';
  if (s === 'ATRASADO') return 'LATE';
  if (s === 'PARCIAL') return 'PARTIAL';
  return 'PENDING';
}

/**
 * Normaliza status de parcelas do loan (caso existam variações)
 */
function normalizeLoanInstallmentStatus(statusRaw: unknown): LoanStatus {
  const s = asString(statusRaw).toUpperCase().trim();
  if (!s) return LoanStatus.PENDING;
  if (s === 'PAID' || s === 'PAGO') return LoanStatus.PAID;
  if (s === 'OPEN' || s === 'ABERTO') return LoanStatus.PENDING;
  if (s === 'LATE' || s === 'ATRASADO') return LoanStatus.LATE;
  if (s === 'PARTIAL' || s === 'PARCIAL') return LoanStatus.PARTIAL;
  return LoanStatus.PENDING;
}

/**
 * Adapter do acordo para o formato Agreement esperado pelo frontend.
 */
export function agreementAdapter(rawAgreement: any, rawInstallments?: any[]): Agreement {
  const a = rawAgreement ?? {};

  const installments: AgreementInstallment[] = asArray(rawInstallments).map((p: any) => {
    return {
      id: asString(p?.id),
      agreementId: asString(p?.acordo_id ?? p?.agreement_id ?? a?.id),
      number: asNumber(p?.numero ?? p?.installment_number ?? p?.n),
      amount: asNumber(p?.amount ?? p?.valor ?? p?.valor_parcela),
      dueDate: safeDateString(p?.due_date ?? p?.dueDate, 'dueDate'),
      paidDate: safeDateString(p?.paid_at ?? p?.paidAt ?? p?.data_pagamento),
      status: normalizeAgreementInstallmentStatus(p?.status),
      paidAmount: asNumber(p?.paid_amount ?? p?.valor_pago ?? p?.paidAmount ?? 0),
    } as AgreementInstallment;
  });

  const agreement: Agreement = {
    id: asString(a?.id),
    loanId: asString(a?.loan_id ?? a?.contrato_id),
    type: asString(a?.tipo ?? a?.type) as any,
    status: normalizeAgreementStatus(a?.status),
    negotiatedTotal: asNumber(a?.total_negociado ?? a?.negotiatedTotal ?? a?.total),
    totalDebtAtNegotiation: asNumber(a?.total_divida_base ?? a?.totalDebtAtNegotiation),
    installmentsCount: asNumber(a?.num_parcelas ?? a?.installmentsCount ?? installments.length),
    frequency: asString(a?.periodicidade ?? a?.frequency) as any,
    startDate: safeDateString(a?.created_at ?? a?.startDate ?? new Date().toISOString()),
    interestRate: asNumber(a?.juros_aplicado ?? a?.interestRate ?? 0),
    calculationMode: asString(a?.calculation_mode ?? a?.calculationMode) as any,
    interestApplicationMode: asString(a?.interest_application_mode ?? a?.interestApplicationMode) as any,
    interestBaseMode: asString(a?.interest_base_mode ?? a?.interestBaseMode) as any,
    installmentValue: asNumber(a?.installment_value ?? a?.installmentValue),
    createdAt: safeDateString(a?.created_at ?? a?.createdAt),
    installments,
  } as Agreement;

  return agreement;
}

/**
 * Mapeia Loan do formato retornado pelo Supabase para o shape usado no frontend.
 * IMPORTANTE: saída SEMPRE em camelCase (igual types.ts).
 */
export function mapLoanFromDB(
  rawLoan: any,
  rawInstallments: any[],
  rawAgreement?: any,
  rawAgreementInstallments?: any[]
): Loan {
  const l = rawLoan ?? {};

  const installments: Installment[] = asArray(rawInstallments).map((inst: any) => {
    const status = normalizeLoanInstallmentStatus(inst?.status);

    return {
      id: asString(inst?.id),
      dueDate: safeDateString(inst?.data_vencimento ?? inst?.dueDate ?? inst?.due_date, 'dueDate'),
      amount: asNumber(inst?.amount ?? inst?.valor_parcela),
      scheduledPrincipal: asNumber(inst?.scheduled_principal ?? inst?.scheduledPrincipal),
      scheduledInterest: asNumber(inst?.scheduled_interest ?? inst?.scheduledInterest),
      principalRemaining: asNumber(inst?.principal_remaining ?? inst?.principalRemaining),
      interestRemaining: asNumber(inst?.interest_remaining ?? inst?.interestRemaining),
      lateFeeAccrued: asNumber(inst?.late_fee_accrued ?? inst?.lateFeeAccrued),
      avApplied: asNumber(inst?.av_applied ?? inst?.avApplied),
      paidPrincipal: asNumber(inst?.paid_principal ?? inst?.paidPrincipal),
      paidInterest: asNumber(inst?.paid_interest ?? inst?.paidInterest),
      paidLateFee: asNumber(inst?.paid_late_fee ?? inst?.paidLateFee),
      paidTotal: asNumber(inst?.paid_total ?? inst?.paidTotal),
      status,
      paidDate: safeDateString(inst?.paid_date ?? inst?.paidDate),
      paidAmount: asNumber(inst?.paid_amount ?? inst?.paidAmount),
      logs: asArray(inst?.logs),
      renewalCount: asNumber(inst?.renewal_count ?? inst?.renewalCount),
      number: asNumber(inst?.number ?? inst?.numero ?? inst?.n),
    } as Installment;
  });

  const startDate = safeDateString(l?.start_date ?? l?.startDate, 'startDate');

  const activeAgreement = rawAgreement
    ? agreementAdapter(rawAgreement, rawAgreementInstallments)
    : undefined;

  // funding vindo do banco (snake_case) ou de payloads antigos (camelCase)
  const fundingTotalPayable = asNumber(l?.funding_total_payable ?? l?.fundingTotalPayable);
  const fundingCost = asNumber(l?.funding_cost ?? l?.fundingCost);

  const loan: Loan = {
    id: asString(l?.id),

    // necessário p/ PIX/Portal (Realtime/RLS e criação de charge)
    profile_id: asString(l?.profile_id ?? l?.profileId ?? l?.owner_id ?? l?.ownerId) || l?.profile_id || l?.profileId || null,
    profileId: asString(l?.profile_id ?? l?.profileId ?? l?.owner_id ?? l?.ownerId) || l?.profile_id || l?.profileId || null,

    clientId: asString(l?.client_id ?? l?.clientId ?? l?.clientID) || null,
    debtorName: asString(l?.debtor_name ?? l?.debtorName),
    debtorPhone: asString(l?.debtor_phone ?? l?.debtorPhone),
    debtorDocument: asString(l?.debtor_document ?? l?.debtorDocument),
    debtorAddress: asString(l?.debtor_address ?? l?.debtorAddress),

    sourceId: asString(l?.source_id ?? l?.sourceId),
    preferredPaymentMethod: asString(
      l?.preferred_payment_method ?? l?.preferredPaymentMethod,
      'PIX'
    ) as any,
    pixKey: asString(l?.pix_key ?? l?.pixKey),

    billingCycle: asString(l?.billing_cycle ?? l?.billingCycle) as any,
    amortizationType: asString(l?.amortization_type ?? l?.amortizationType, 'JUROS') as any,

    principal: asNumber(l?.principal),

    // ✅ SAÍDA EM camelCase (igual types.ts)
    fundingTotalPayable: fundingTotalPayable || undefined,
    fundingCost: fundingCost || undefined,
    fundingProvider: asString(l?.funding_provider ?? l?.fundingProvider),
    fundingFeePercent: asNumber(l?.funding_fee_percent ?? l?.fundingFeePercent),
    fundingCalculationMode: asString(l?.funding_calculation_mode ?? l?.fundingCalculationMode) as any,
    fundingInstallmentsCount: asNumber(l?.funding_installments_count ?? l?.fundingInstallmentsCount),
    fundingMonthlyRate: asNumber(l?.funding_monthly_rate ?? l?.fundingMonthlyRate),
    fundingInstallmentValue: asNumber(l?.funding_installment_value ?? l?.fundingInstallmentValue),
    customerMarginPercent: asNumber(l?.customer_margin_percent ?? l?.customerMarginPercent),
    customerInstallmentValue: asNumber(l?.customer_installment_value ?? l?.customerInstallmentValue),
    customerTotalPayable: asNumber(l?.customer_total_payable ?? l?.customerTotalPayable),

    interestRate: asNumber(l?.interest_rate ?? l?.interestRate),
    finePercent: asNumber(l?.fine_percent ?? l?.finePercent),
    dailyInterestPercent: asNumber(l?.daily_interest_percent ?? l?.dailyInterestPercent),

    policiesSnapshot: l?.policies_snapshot ?? l?.policiesSnapshot,

    startDate,
    createdAt: safeDateString(l?.created_at ?? l?.createdAt),
    updatedAt: safeDateString(l?.updated_at ?? l?.updatedAt),

    installments,

    totalToReceive: asNumber(l?.total_to_receive ?? l?.totalToReceive),

    ledger: asArray(l?.ledger),
    paymentSignals: asArray(l?.paymentSignals ?? l?.sinalizacoes_pagamento),

    notes: asString(l?.notes),

    guaranteeDescription: asString(l?.guarantee_description ?? l?.guaranteeDescription),

    attachments: asArray(l?.attachments),
    documentPhotos: asArray(l?.documentPhotos),
    customDocuments: asArray(l?.customDocuments),

    isArchived: !!(l?.is_archived ?? l?.isArchived),
    skipWeekends: !!(l?.skip_weekends ?? l?.skipWeekends),

    portalToken: asString(l?.portal_token ?? l?.portalToken),
    portalShortcode: asString(l?.portal_shortcode ?? l?.portalShortcode),

    contato_whatsapp: asString(l?.contato_whatsapp ?? l?.support_phone ?? l?.supportPhone),
    last_billed_at: safeDateString(l?.last_billed_at ?? l?.lastBilledAt),
    billing_count: Number(l?.billing_count ?? l?.billingCount ?? 0),

    status: normalizeLoanStatus(l?.status),

    activeAgreement,
  } as Loan;

  return loan;
}
