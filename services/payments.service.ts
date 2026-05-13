// services/payments.service.ts
import { supabase } from '../lib/supabase';
import type { CapitalSource, Installment, Loan, UserProfile } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { calculateTotalDue, ZERO_BALANCE_THRESHOLD } from '../domain/finance/calculations';
import { todayDateOnlyUTC } from '../utils/dateHelpers';
import { generateUUID } from '../utils/generators';
import { isUUID, safeUUID } from '../utils/uuid';

const parseMoney = (v: string) => {
  if (!v) return 0;
  const clean = String(v).replace(/[R$\s]/g, '');
  if (clean.includes('.') && clean.includes(',')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (clean.includes(',')) return parseFloat(clean.replace(',', '.')) || 0;
  return parseFloat(clean) || 0;
};

const normalize = (s: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function resolveRenewalBuckets(loan: Loan, installment: Installment) {
  const principal = Number(installment.principalRemaining ?? loan.principal ?? 0) || 0;
  const currentCalc = calculateTotalDue(loan, installment);
  const explicitInterest = Number(currentCalc.interest || 0);
  const explicitLateFee = Number(currentCalc.lateFee || 0);
  const expectedCycleInterest = roundMoney(principal * ((Number((loan as any).interestRate) || 0) / 100));
  const interest = Math.max(explicitInterest, expectedCycleInterest);

  return {
    interest,
    lateFee: explicitLateFee,
    total: roundMoney(interest + explicitLateFee),
  };
}

function resolveCaixaLivreIdFromMemory(sources: CapitalSource[]): string | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const byFlag = (sources as any[]).find(
    (s) => s?.is_caixa_livre === true || s?.isCaixaLivre === true || s?.is_profit_box === true
  );
  if (byFlag?.id && isUUID(byFlag.id)) return byFlag.id;

  const caixaLivre = sources.find((s) => {
    const n = normalize((s as any)?.name ?? (s as any)?.nome);
    return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
  });
  if (caixaLivre?.id && isUUID(caixaLivre.id)) return caixaLivre.id;

  return null;
}

async function resolveCaixaLivreIdFromDB(ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('fontes')
    .select('id,nome')
    .eq('profile_id', ownerId)
    .limit(50);

  if (error || !data) return null;

  const found = data.find((f: any) => {
    const n = normalize(f?.nome);
    return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
  });

  return found?.id && isUUID(found.id) ? found.id : null;
}

async function revalidateInstallment(instId: string) {
  const safeId = safeUUID(instId);
  if (!safeId) return null;

  const { data, error } = await supabase
    .from('parcelas')
    .select('id,status,principal_remaining,interest_remaining,late_fee_accrued,loan_id')
    .eq('id', safeId)
    .single();

  if (error) throw new Error('Falha ao revalidar parcela no banco: ' + error.message);
  return data as any;
}

export const paymentsService = {
  async processPayment(params: {
    loan: Loan;
    inst: Installment;
    calculations: any;
    amountPaid: number;
    activeUser: UserProfile;
    sources: CapitalSource[];
    forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'INTEREST_ONLY' | 'BOTH';
    manualDate?: Date | null;
    realDate?: Date | null;
    capitalizeRemaining?: boolean;
    paymentType?: string;
    avAmount?: string;
  }) {
    const {
      loan,
      inst,
      amountPaid,
      activeUser,
      sources,
      forgivenessMode = 'NONE',
      realDate,
      manualDate,
      capitalizeRemaining = false,
      paymentType: legacyPaymentType,
      avAmount: legacyAvAmount,
    } = params;

    if (!activeUser?.id) {
      throw new Error('Usuário não autenticado. Refaça o login.');
    }

    if (activeUser.id === 'DEMO') {
      return { amountToPay: amountPaid || 0, paymentType: 'CUSTOM' };
    }

    const ownerId =
      safeUUID((loan as any).profile_id) ||
      safeUUID((activeUser as any).supervisor_id) ||
      safeUUID(activeUser.id);

    if (!ownerId) throw new Error('Perfil inválido. Refaça o login.');

    const loanId = safeUUID((loan as any).id);
    const instId = safeUUID((inst as any).id);

    if (!loanId) throw new Error('Contrato inválido (loan.id).');
    if (!instId) throw new Error('Parcela inválida (inst.id).');

    const instDb = await revalidateInstallment(instId);
    const statusDb = String(instDb?.status || '').toUpperCase();
    const remainingDb =
      Number(instDb?.principal_remaining || 0) +
      Number(instDb?.interest_remaining || 0) +
      Number(instDb?.late_fee_accrued || 0);

    if (statusDb === 'PAID' || remainingDb <= ZERO_BALANCE_THRESHOLD) {
      throw new Error('Parcela já quitada (revalidado no banco). Atualize a tela.');
    }

    const idempotencyKey = generateUUID();

    if (legacyPaymentType === 'LEND_MORE') {
      const lendAmount = parseMoney(legacyAvAmount || '0');
      if (lendAmount <= 0) throw new Error('Valor do aporte inválido.');

      const sourceId = safeUUID((loan as any).sourceId);
      if (!sourceId) throw new Error('Fonte do contrato inválida (sourceId).');

      const { error } = await supabase.rpc('process_lend_more_atomic', {
        p_idempotency_key: idempotencyKey,
        p_loan_id: loanId,
        p_installment_id: instId,
        p_profile_id: ownerId,
        p_operator_id: safeUUID(activeUser.id),
        p_source_id: sourceId,
        p_amount: lendAmount,
        p_notes: `Novo Aporte (+ R$ ${lendAmount.toFixed(2)})`,
      });

      if (error) throw new Error(error.message);
      return { amountToPay: lendAmount, paymentType: 'LEND_MORE' };
    }

    const amountToPay = Number(amountPaid || 0);
    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
      throw new Error('O valor do pagamento deve ser maior que zero.');
    }

    const installmentSnapshot = {
      ...inst,
      principalRemaining: Number(instDb?.principal_remaining ?? (inst as any)?.principalRemaining ?? 0),
      interestRemaining: Number(instDb?.interest_remaining ?? (inst as any)?.interestRemaining ?? 0),
      lateFeeAccrued: Number(instDb?.late_fee_accrued ?? (inst as any)?.lateFeeAccrued ?? 0),
      status: String(instDb?.status ?? (inst as any)?.status ?? 'PENDING'),
    } as Installment;

    const amortization = loanEngine.calculateInstallmentAmortization(
      amountToPay,
      loan,
      installmentSnapshot,
      forgivenessMode
    ) as unknown as {
      paidPrincipal: number;
      paidInterest: number;
      paidLateFee: number;
      forgivenLateFee: number;
      avGenerated: number;
    };

    let principalPaid = Number(amortization.paidPrincipal || 0);
    let interestPaid = Number(amortization.paidInterest || 0);
    let lateFeePaid = Number(amortization.paidLateFee || 0);
    const forgivenLateFee = Number(amortization.forgivenLateFee || 0);
    
    // ✅ TRATAMENTO DE EXCESSO: Se houver sobra (AV), amortiza no principal automaticamente
    const avExtra = Number(amortization.avGenerated || 0);
    if (avExtra > ZERO_BALANCE_THRESHOLD) {
      principalPaid = roundMoney(principalPaid + avExtra);
    }
    
    let totalPaid = principalPaid + interestPaid + lateFeePaid;

    const renewalBuckets = resolveRenewalBuckets(loan, installmentSnapshot);

    // ✅ FIX DEFINITIVO: Sempre prioriza a alocação nos encargos esperados (Mora -> Juros -> Principal)
    if (principalPaid > 0 && renewalBuckets.total > ZERO_BALANCE_THRESHOLD) {
      let remaining = amountToPay;
      
      lateFeePaid = Math.min(remaining, renewalBuckets.lateFee);
      remaining = roundMoney(remaining - lateFeePaid);

      interestPaid = Math.min(remaining, renewalBuckets.interest);
      remaining = roundMoney(remaining - interestPaid);

      principalPaid = remaining;
      totalPaid = amountToPay;
    }

    // ✅ DEFENSIVE FALLBACK: Se o motor de amortização falhou (retornou 0) mas há valor sendo pago
    if (totalPaid <= 0 && amountToPay > 0) {
      console.warn('[Payments] Amortização retornou ZERO. Ativando alocação defensiva...', { amountToPay, loanId: loan.id });
      
      const interestRate = (Number((loan as any).interestRate) || 0) / 100;
      const headPrincipal = Number(loan.principal) || 0;
      const estimatedInterest = Math.round(headPrincipal * interestRate * 100) / 100;
      
      if (estimatedInterest > 0) {
        interestPaid = Math.min(amountToPay, estimatedInterest);
        principalPaid = Math.max(0, amountToPay - interestPaid);
      } else {
        principalPaid = amountToPay;
      }
      totalPaid = principalPaid + interestPaid + lateFeePaid;
    }

    if (!Number.isFinite(totalPaid) || totalPaid <= 0) {
      throw new Error(`[V3] Falha ao calcular amortização (Pago: ${totalPaid}, Esperado: ${amountToPay}). Verifique o saldo do contrato.`);
    }

    // Formata data para YYYY-MM-DD (Evita erros de timestamp no Postgres DATE)
    const paymentDate = realDate || todayDateOnlyUTC();
    const paymentDateStr = paymentDate.toISOString().split('T')[0];
    
    const sourceId = safeUUID((loan as any).sourceId);
    if (!sourceId) throw new Error('Fonte do contrato inválida (sourceId).');

    const nextCycleInterest = roundMoney(
      Number(installmentSnapshot.principalRemaining || 0) * ((Number((loan as any).interestRate) || 0) / 100)
    );
    const isInterestRenewal =
      principalPaid <= ZERO_BALANCE_THRESHOLD &&
      renewalBuckets.total > ZERO_BALANCE_THRESHOLD &&
      amountToPay >= renewalBuckets.total - ZERO_BALANCE_THRESHOLD &&
      Number(installmentSnapshot.principalRemaining || 0) > ZERO_BALANCE_THRESHOLD;

    // Busca carteira de lucro, mas não bloqueia se não encontrar (o banco usará interest_balance como fallback)
    let caixaLivreId = resolveCaixaLivreIdFromMemory(sources);
    if (!caixaLivreId) {
       try {
          caixaLivreId = await resolveCaixaLivreIdFromDB(ownerId);
       } catch (e) {
          console.warn('Erro ao buscar Caixa Livre no DB:', e);
       }
    }

    const { error } = await supabase.rpc('process_payment_v3_selective', {
      p_idempotency_key: idempotencyKey,
      p_loan_id: loanId,
      p_installment_id: instId,
      p_profile_id: ownerId,
      p_operator_id: safeUUID(activeUser.id),
      p_principal_paid: principalPaid,
      p_interest_paid: interestPaid,
      p_late_fee_paid: lateFeePaid,
      p_late_fee_forgiven: forgivenLateFee,
      p_payment_date: paymentDateStr,
      p_capitalize_remaining: !!capitalizeRemaining,
      p_source_id: sourceId,
      p_caixa_livre_id: safeUUID(caixaLivreId),
    });

    if (error) throw new Error('Falha na persistência: ' + error.message);

    try {
      await supabase.from('payment_transactions').insert({
        installment_id: instId,
        contract_id: loanId,
        amount: amountToPay,
        payment_method: 'OTHER',
        paid_at: new Date().toISOString(),
        operator_profile_id: activeUser.id,
        status: 'PAID',
        idempotency_key: idempotencyKey,
      });
    } catch (auditErr) {
      console.error('Erro ao gravar auditoria de pagamento:', auditErr);
    }

    if (manualDate) {
      const nextDueDate = manualDate.toISOString().split('T')[0];
      const updatePayload: any = {
        data_vencimento: nextDueDate,
        due_date: nextDueDate,
      };

      // ✅ FIX: Se a data está avançando e o contrato é Mensal/Giro (Modo de Renovação), 
      // precisamos repor os juros do próximo mês se o capital ainda existe.
      const isMonthlyOrGiro = ['MONTHLY', 'GIRO', 'REVOLVING'].includes((loan as any).billingCycle || '');
      const hasPrincipalRemaining = Number(installmentSnapshot.principalRemaining || 0) > ZERO_BALANCE_THRESHOLD;

      if (isMonthlyOrGiro && hasPrincipalRemaining) {
        // Se a data avançou pelo menos 15 dias, consideramos um novo ciclo
        const currentDueDate = parseDateOnlyUTC(inst.dueDate);
        const diffDays = (manualDate.getTime() - currentDueDate.getTime()) / (1000 * 3600 * 24);

        if (diffDays >= 15) {
          updatePayload.interest_remaining = nextCycleInterest;
          updatePayload.scheduled_interest = nextCycleInterest;
          updatePayload.late_fee_accrued = 0;
          updatePayload.status = 'PENDING';
          updatePayload.paid_date = null;
        }
      }

      const { error: dateError } = await supabase
        .from('parcelas')
        .update(updatePayload)
        .eq('id', instId);

      if (dateError) {
        console.error('Erro ao atualizar data de vencimento:', dateError);
      }
    }

    let finalType = 'CUSTOM';
    const balance = loanEngine.computeRemainingBalance(loan);
    const remainingAfterPayment = Math.max(
      0,
      Number(balance.totalRemaining || 0) - principalPaid - interestPaid - lateFeePaid - forgivenLateFee
    );

    if (remainingAfterPayment <= ZERO_BALANCE_THRESHOLD) finalType = 'FULL';
    else if (principalPaid > 0) finalType = 'RENEW_AV';
    else finalType = 'RENEW_INTEREST';

    return { amountToPay, paymentType: finalType, amortization };
  },
};
