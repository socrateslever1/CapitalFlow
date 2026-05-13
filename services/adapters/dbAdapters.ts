// services/adapters/dbAdapters.ts
import { Loan, LoanStatus, Agreement, AgreementStatus, PaymentMethod, LoanBillingModality } from '../../types';
import { maskPhone } from '../../utils/formatters';
import { asArray, asNumber, asString, safeDateString } from '../../utils/safe';

/* =====================================================
   ADAPTER JURÍDICO (BANCO -> FRONTEND)
===================================================== */
export const agreementAdapter = (raw: any): Agreement => {
  if (!raw) throw new Error('Dados do acordo inválidos');

  const dbStatus = asString(raw.status, '', 'status').trim().toUpperCase();

  let normalizedStatus: AgreementStatus = 'ACTIVE';
  if (['PAGO', 'PAID', 'QUITADO', 'QUITADA'].includes(dbStatus)) normalizedStatus = 'PAID';
  else if (['BROKEN', 'QUEBRADO', 'CANCELADO', 'INATIVO'].includes(dbStatus)) normalizedStatus = 'BROKEN';
  else if (['ATIVO', 'ACTIVE'].includes(dbStatus)) normalizedStatus = 'ACTIVE';

  const installments = asArray(raw.acordo_parcelas)
    .map((p: any) => {
      const rawInstStatus = asString(p.status, 'PENDING').trim().toUpperCase();

      const normalizedInstallmentStatus =
        ['PAGO', 'PAID', 'QUITADO', 'QUITADA'].includes(rawInstStatus) ? 'PAID' : rawInstStatus;

      return {
        id: asString(p.id, `tmp-${Math.random()}`),
        agreementId: asString(raw.id, '', 'agreement.id'),
        number: asNumber(p.numero),
        dueDate: safeDateString(p.data_vencimento ?? p.due_date, 'dueDate'),
        amount: asNumber(p.valor ?? p.amount),
        status: normalizedInstallmentStatus,
        paidAmount: asNumber(p.valor_pago ?? p.paid_amount),
        paidDate: p.data_pagamento ?? p.paid_at
      };
    })
    .sort((a: any, b: any) => a.number - b.number);

  return {
    id: asString(raw.id, '', 'agreement.id'),
    loanId: asString(raw.loan_id, '', 'loanId'),
    type: (raw.tipo || 'PARCELADO_COM_JUROS') as any,
    totalDebtAtNegotiation: asNumber(raw.total_base),
    negotiatedTotal: asNumber(raw.total_negociado),
    interestRate: asNumber(raw.juros_mensal_percent),
    installmentsCount: asNumber(raw.num_parcelas) || installments.length,
    frequency: asString(raw.periodicidade, 'MONTHLY'),
    startDate: safeDateString(raw.created_at),
    status: normalizedStatus,
    createdAt: safeDateString(raw.created_at),
    installments,
    gracePeriod: asNumber(raw.grace_period),
    discount: asNumber(raw.discount),
    downPayment: asNumber(raw.down_payment)
  } as Agreement;
};

/* =====================================================
   ADAPTER CONTRATO (BANCO -> FRONTEND)
   EXPORTA mapLoanFromDB (usado no app)
===================================================== */
export const mapLoanFromDB = (l: any, clientsData: any[] = []): Loan => {
  const rawParcelas = asArray(l.parcelas);
  const rawTransacoes = asArray(l.transacoes);
  const rawSinais = asArray(l.payment_intents);

  /* =============================
     NORMALIZAÇÃO DEFINITIVA STATUS (PARCELAS)
  ============================== */
  const installments = rawParcelas.map((p: any) => {
    const rawStatus = asString(p.status, 'PENDING').trim().toUpperCase();

    let normalizedInstallmentStatus: LoanStatus;

    if (['PAGO', 'PAID', 'QUITADO', 'QUITADA'].includes(rawStatus)) {
      normalizedInstallmentStatus = LoanStatus.PAID;
    } else if (['PARCIAL', 'PARTIAL'].includes(rawStatus)) {
      normalizedInstallmentStatus = LoanStatus.PARTIAL;
    } else if (['PENDENTE', 'PENDING', 'OPEN', 'ABERTA'].includes(rawStatus)) {
      normalizedInstallmentStatus = LoanStatus.PENDING;
    } else if (rawStatus === 'LATE' || rawStatus === 'ATRASADO') {
      normalizedInstallmentStatus = LoanStatus.LATE;
    } else if (rawStatus === 'RENEGOCIADO') {
      normalizedInstallmentStatus = LoanStatus.RENEGOCIADO;
    } else {
      normalizedInstallmentStatus = LoanStatus.PENDING;
    }

    return {
      id: asString(p.id),
      dueDate: safeDateString(p.data_vencimento || p.due_date, 'dueDate'),
      amount: asNumber(p.valor_parcela || p.amount),
      scheduledPrincipal: asNumber(p.scheduled_principal),
      scheduledInterest: asNumber(p.scheduled_interest),
      principalRemaining: asNumber(p.principal_remaining),
      interestRemaining: asNumber(p.interest_remaining),
      lateFeeAccrued: asNumber(p.late_fee_accrued),
      avApplied: asNumber(p.av_applied),
      paidPrincipal: asNumber(p.paid_principal),
      paidInterest: asNumber(p.paid_interest),
      paidLateFee: asNumber(p.paid_late_fee),
      paidTotal: asNumber(p.paid_total),
      status: normalizedInstallmentStatus,
      paidDate: p.paid_date,
      logs: []
    };
  });

  const ledger = rawTransacoes.map((t: any) => ({
    id: asString(t.id),
    date: safeDateString(t.date),
    type: asString(t.type, 'UNKNOWN') as any,
    amount: asNumber(t.amount),
    principalDelta: asNumber(t.principal_delta),
    interestDelta: asNumber(t.interest_delta),
    lateFeeDelta: asNumber(t.late_fee_delta),
    sourceId: t.source_id,
    installmentId: t.installment_id,
    agreementId: t.agreement_id,
    notes: asString(t.notes),
    category: asString(t.category) as any
  }));

  const signals = rawSinais.map((s: any) => ({
    id: asString(s.id),
    date: safeDateString(s.created_at),
    type: asString(s.method || s.type || s.tipo_intencao),
    status: asString(s.status),
    comprovanteUrl: asString(s.comprovante_url || s.proof_url),
    clientViewedAt: safeDateString(s.client_viewed_at),
    reviewNote: asString(s.review_note)
  }));

  let activeAgreement: Agreement | undefined = undefined;
  let pastAgreements: Agreement[] = [];
  const agreementsArr = asArray(l.acordos_inadimplencia);
  
  if (agreementsArr.length > 0) {
    const mappedAgreements = agreementsArr
      .map(raw => {
        try {
          return agreementAdapter(raw);
        } catch (e) {
          console.warn('Falha ao mapear acordo', l.id, e);
          return null;
        }
      })
      .filter(Boolean) as Agreement[];

    // Ordena do mais recente para o mais antigo
    mappedAgreements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Identifica o acordo ativo (se houver)
    const activeIndex = mappedAgreements.findIndex(a => a.status === 'ACTIVE' || a.status === 'ATIVO');
    
    if (activeIndex !== -1) {
      activeAgreement = mappedAgreements[activeIndex];
      pastAgreements = mappedAgreements.filter((_, idx) => idx !== activeIndex);
    } else {
      pastAgreements = mappedAgreements;
    }
  }

  let phone = l.debtor_phone || l.phone || l.telefone || l.celular;
  if ((!phone || String(phone).trim() === '') && l.client_id && asArray(clientsData).length > 0) {
    const linkedClient = clientsData.find((c: any) => c.id === l.client_id);
    if (linkedClient) {
      phone = linkedClient.phone || linkedClient.telefone || linkedClient.celular;
    }
  }

  return {
    id: asString(l.id, '', 'id'),
    clientId: asString(l.client_id),
    profile_id: asString(l.profile_id),
    owner_id: asString(l.owner_id),
    operador_responsavel_id: asString(l.operador_responsavel_id),

    debtorName: asString(l.debtor_name, 'Cliente Desconhecido'),
    debtorPhone: maskPhone(asString(phone, '00000000000')),
    debtorDocument: l.debtor_document,
    debtorAddress: l.debtor_address,
    clientAvatarUrl: l.cliente_foto_url,

    sourceId: asString(l.source_id),
    preferredPaymentMethod: asString(l.preferred_payment_method, 'PIX') as PaymentMethod,
    pixKey: l.pix_key,

    principal: asNumber(l.principal),
    interestRate: asNumber(l.interest_rate),
    finePercent: asNumber(l.fine_percent),
    dailyInterestPercent: asNumber(l.daily_interest_percent),

    fundingTotalPayable: asNumber(l.funding_total_payable),
    fundingCost: asNumber(l.funding_cost),
    fundingProvider: asString(l.funding_provider),
    fundingFeePercent: asNumber(l.funding_fee_percent),

    billingCycle: asString(l.billing_cycle, 'MONTHLY') as LoanBillingModality,
    amortizationType: asString(l.amortization_type, 'JUROS') as any,

    startDate: safeDateString(l.start_date),
    createdAt: safeDateString(l.created_at),
    updatedAt: safeDateString(l.updated_at),

    totalToReceive: asNumber(l.total_to_receive),
    notes: asString(l.notes),
    guaranteeDescription: asString(l.guarantee_description),
    policiesSnapshot: l.policies_snapshot || null,

    installments,
    ledger,
    paymentSignals: signals,
    customDocuments: asArray(l.policies_snapshot?.customDocuments),
    isArchived: !!l.is_archived,

    attachments: [],
    documentPhotos: [],

    activeAgreement,
    pastAgreements,

    portalToken: asString(l.portal_token),
    portalShortcode: asString(l.portal_shortcode),

    last_billed_at: safeDateString(l.last_billed_at),
    billing_count: asNumber(l.billing_count),

    status: asString(l.status) as LoanStatus,
  };
};