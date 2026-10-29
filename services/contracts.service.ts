// services/contracts.service.ts
import { supabase } from '../lib/supabase';
import { UserProfile, Loan, CapitalSource } from '../types';
import { generateUUID } from '../utils/generators';
import { isUUID, safeUUID } from '../utils/uuid';
import {
  isCapitalOnlyRecoveryLoan,
} from '../utils/capitalOnlyRecovery';
import { clearStableFinancialRequestKey, getStableFinancialRequestKey } from './payments/paymentEngineV4';
import { validateFundingAllocations } from '../domain/finance/fundingAllocations';
import { calculateAdditionalCapital, canReceiveCapitalAdvance } from '../domain/finance/capitalAdvance';
import { adjustSourceBalanceSafe } from './payments/paymentWallets';

/* =========================
   Helpers de Sanitização
========================= */
const ensureUUID = (v: any) => (isUUID(v) ? v : generateUUID());

const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');
const UNKNOWN_DOCUMENT = '00000000000';
const isUnknownDocument = (value: any) => onlyDigits(value) === UNKNOWN_DOCUMENT;

const safeFloat = (v: any): number => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const str = String(v).trim();
  if (str.includes('.') && str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  if (str.includes(',')) return parseFloat(str.replace(',', '.')) || 0;
  return parseFloat(str) || 0;
};

const stripUndefined = (payload: Record<string, any>) => (
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
);

const extractMissingColumn = (error: any): string | null => {
  const message = String(error?.message || error?.details || error || '');
  return (
    message.match(/column "([^"]+)"/i)?.[1] ||
    message.match(/'([^']+)' column/i)?.[1] ||
    null
  );
};

const isSchemaColumnError = (error: any) => {
  const message = String(error?.message || error?.details || error || '').toLowerCase();
  return message.includes('does not exist') || message.includes('schema cache') || message.includes('could not find');
};

const runContractMutationWithSchemaFallback = async (
  payload: Record<string, any>,
  mutate: (nextPayload: Record<string, any>) => any
) => {
  let nextPayload = stripUndefined(payload);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await mutate(nextPayload);
    if (!error) return;

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || removedColumns.has(missingColumn) || !(missingColumn in nextPayload) || !isSchemaColumnError(error)) {
      throw new Error(error.message || String(error));
    }

    removedColumns.add(missingColumn);
    const { [missingColumn]: _removed, ...fallbackPayload } = nextPayload;
    nextPayload = fallbackPayload;
    console.warn(`[ContractsService] Coluna opcional ausente em contratos: ${missingColumn}. Tentando salvar sem ela.`);
  }

  throw new Error('Falha ao salvar contrato por incompatibilidade de schema.');
};

async function applyDirectPrincipalReductionFallback({
  loanId,
  ownerId,
  operatorId,
  sourceId,
  currentPrincipal,
  requestedPrincipal,
  reductionAmount,
  editingLoan,
  idempotencyKey,
}: {
  loanId: string;
  ownerId: string;
  operatorId: string | null;
  sourceId: string | null;
  currentPrincipal: number;
  requestedPrincipal: number;
  reductionAmount: number;
  editingLoan: any;
  idempotencyKey: string;
}) {
  if (!sourceId) throw new Error('Fonte de capital obrigatória para o abatimento.');

  // 1. Credit the source balance with the reduced amount
  await adjustSourceBalanceSafe(sourceId, reductionAmount);

  // 2. Update contract principal and totalToReceive
  const totalBefore = Number(editingLoan?.totalToReceive ?? editingLoan?.principal ?? currentPrincipal);
  const totalAfter = Math.max(0, Math.round((totalBefore - reductionAmount) * 100) / 100);
  await supabase
    .from('contratos')
    .update({
      principal: requestedPrincipal,
      total_to_receive: totalAfter,
    })
    .eq('id', loanId);

  // 3. Distribute reduction across open installments from last to first
  const openInstallments = (editingLoan?.installments || [])
    .filter((inst: any) => {
      const status = String(inst.status || '').toUpperCase();
      const pRem = Number(inst.principalRemaining ?? inst.principal_remaining ?? 0);
      return !['PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO', 'RENEGOCIADO'].includes(status) && pRem > 0.005;
    })
    .sort((a: any, b: any) => {
      const numA = Number(a.number ?? a.numero_parcela ?? 0);
      const numB = Number(b.number ?? b.numero_parcela ?? 0);
      return numB - numA;
    });

  let remainingReduction = reductionAmount;
  const firstInstId = openInstallments[0]?.id || null;

  for (const inst of openInstallments) {
    if (remainingReduction <= 0.005) break;
    const instPrincipal = Number(inst.principalRemaining ?? inst.principal_remaining ?? 0);
    const alloc = Math.min(remainingReduction, instPrincipal);
    const newPrincipalRem = Math.max(0, Math.round((instPrincipal - alloc) * 100) / 100);
    const schedP = Math.max(0, Math.round((Number(inst.scheduledPrincipal ?? inst.scheduled_principal ?? instPrincipal) - alloc) * 100) / 100);
    const amt = Math.max(0, Math.round((Number(inst.amount ?? inst.valor_parcela ?? 0) - alloc) * 100) / 100);

    await supabase
      .from('parcelas')
      .update({
        principal_remaining: newPrincipalRem,
        scheduled_principal: schedP,
        amount: amt,
        valor_parcela: amt,
      })
      .eq('id', inst.id);

    remainingReduction = Math.round((remainingReduction - alloc) * 100) / 100;
  }

  // 4. Record ledger transaction
  const txPayload: any = {
    id: generateUUID(),
    profile_id: ownerId,
    loan_id: loanId,
    installment_id: safeUUID(firstInstId),
    source_id: sourceId,
    date: new Date().toISOString(),
    type: 'PRINCIPAL_CORRECTION_REDUCTION',
    amount: 0,
    principal_delta: -reductionAmount,
    interest_delta: 0,
    late_fee_delta: 0,
    notes: 'Abatimento de capital registrado na edição do contrato',
    category: 'CORRECAO',
    idempotency_key: idempotencyKey,
    operator_id: operatorId,
    payment_type: 'CORRECAO',
    meta: {
      engine: 'CONTRACT_PRINCIPAL_REDUCTION_FALLBACK',
      reduction_amount: reductionAmount,
      principal_before: currentPrincipal,
      principal_after: requestedPrincipal,
    },
  };

  await supabase.from('transacoes').insert(txPayload);
}

export const contractsService = {
  async saveLoan(loan: Loan, activeUser: UserProfile, _sources: CapitalSource[], editingLoan: Loan | null, options?: { skipTransaction?: boolean }) {
    if (!activeUser?.id) throw new Error('Usuário não autenticado.');

    // ✅ ownerId = dono da conta (supervisor) ou o próprio usuário
    const ownerId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
    if (!ownerId) throw new Error('Perfil inválido.');

    let finalClientId = safeUUID(loan.clientId);

    // --- LÓGICA DE CLIENTE (Criação ou Busca Inteligente) ---
    if (!finalClientId && loan.debtorName) {
      const cleanName = loan.debtorName.trim();
      const cleanDoc = onlyDigits(loan.debtorDocument);
      const cleanPhone = onlyDigits(loan.debtorPhone);

      // 1) Busca por documento (se existir)
      if (cleanDoc && cleanDoc.length >= 11 && !isUnknownDocument(cleanDoc)) {
        const { data: existingByDoc, error: e1 } = await supabase
          .from('clientes')
          .select('id, document')
          .eq('owner_id', safeUUID(ownerId))
          // ✅ importante: compara no padrão do BD (somente dígitos)
          .eq('document', cleanDoc)
          .limit(1)
          .maybeSingle();

        if (e1) throw new Error(e1.message);
        if (existingByDoc?.id) finalClientId = existingByDoc.id;
      }

      // 2) Se não achou por doc, tenta por telefone (opcional)
      if (!finalClientId && cleanPhone && cleanPhone.length >= 10) {
        const { data: existingByPhone, error: ePhone } = await supabase
          .from('clientes')
          .select('id, phone')
          .eq('owner_id', safeUUID(ownerId))
          .eq('phone', cleanPhone)
          .limit(1)
          .maybeSingle();

        if (ePhone) throw new Error(ePhone.message);
        if (existingByPhone?.id) finalClientId = existingByPhone.id;
      }

      // 3) Busca por nome (case-insensitive)
      if (!finalClientId) {
        const { data: existingByName, error: e2 } = await supabase
          .from('clientes')
          .select('id')
          .eq('owner_id', safeUUID(ownerId))
          .ilike('name', cleanName)
          .limit(1)
          .maybeSingle();

        if (e2) throw new Error(e2.message);
        if (existingByName?.id) finalClientId = existingByName.id;
      }

      // 4) Cria cliente se não existir
      if (!finalClientId) {
        const newId = generateUUID();

        const { error: createError } = await supabase.from('clientes').insert({
          id: newId,
          owner_id: ownerId, // ✅ clientes = owner_id
          name: cleanName,
          phone: cleanPhone || null,
          document: cleanDoc || null,
          address: loan.debtorAddress || null,
          access_code: String(Math.floor(Math.random() * 10000)).padStart(4, '0'),
          client_number: String(Math.floor(100000 + Math.random() * 900000)),
          notes: 'Gerado automaticamente ao criar contrato',
          created_at: new Date().toISOString(),
        });

        if (createError) throw new Error('Erro ao criar ficha do cliente: ' + createError.message);
        finalClientId = newId;
      }
    }

    const loanId = editingLoan ? loan.id : ensureUUID(loan.id);
    const requestedPrincipal = safeFloat(loan.principal);
    const currentPrincipal = editingLoan
      ? safeFloat(editingLoan.principal)
      : requestedPrincipal;
    const originalPrincipal = editingLoan
      ? safeFloat(editingLoan.originalPrincipal || editingLoan.principal)
      : requestedPrincipal;
    const additionalCapital = editingLoan
      ? calculateAdditionalCapital(requestedPrincipal, currentPrincipal)
      : 0;
    const principalReduction = editingLoan
      ? Math.max(0, Math.round((currentPrincipal - requestedPrincipal + Number.EPSILON) * 100) / 100)
      : 0;
    const isDailyFreePrincipalReduction = !!editingLoan
      && principalReduction > 0.005
      && String(editingLoan.billingCycle || '').toUpperCase() === 'DAILY_FREE';
    if (principalReduction > 0.005 && safeUUID(loan.sourceId) !== safeUUID(editingLoan?.sourceId)) {
      throw new Error('Para reduzir o capital, mantenha a fonte atual do contrato. A fonte pode ser alterada em uma operação separada.');
    }
    const principal = (additionalCapital > 0 || principalReduction > 0.005) ? currentPrincipal : requestedPrincipal;
    const interestRate = safeFloat(loan.interestRate);
    const finePercent = safeFloat(loan.finePercent);
    const dailyInterestPercent = safeFloat(loan.dailyInterestPercent);
    const fundingCheck = loan.fundingAllocations?.length
      ? validateFundingAllocations(requestedPrincipal, loan.fundingAllocations)
      : null;
    if (fundingCheck && 'error' in fundingCheck) throw new Error(fundingCheck.error);
    const multiSourceAllocations = fundingCheck?.ok && fundingCheck.allocations.length > 1
      ? fundingCheck.allocations
      : [];
    if (multiSourceAllocations.length > 1) {
      throw new Error('A composição por várias fontes permanece temporariamente indisponível até a validação completa dos recebimentos e estornos.');
    }

    // A origem vinculada a uma conta real usa uma RPC de criação atômica,
    // para não deixar contrato criado sem o respectivo débito bancário.
    let isWalletLinkedFunding = false;
    if (!editingLoan && !options?.skipTransaction && safeUUID(loan.sourceId)) {
      const { data: linkedAccount, error: linkLookupError } = await supabase
        .from('personal_wallet_accounts')
        .select('id')
        .eq('capital_source_id', safeUUID(loan.sourceId))
        .is('archived_at', null)
        .maybeSingle();
      if (linkLookupError) {
        throw new Error('Não foi possível verificar a conta da Carteira: ' + linkLookupError.message);
      }
      isWalletLinkedFunding = !!linkedAccount;
    }

    // ✅ contratos = owner_id
    const loanPayload: any = {
      id: loanId,
      owner_id: ownerId,
      operador_responsavel_id: activeUser.accessLevel === 'ADMIN' ? null : safeUUID(activeUser.id),
      client_id: finalClientId,
      source_id: safeUUID(loan.sourceId),

      status: loan.status || 'ATIVO',

      debtor_name: loan.debtorName,
      debtor_phone: loan.debtorPhone,
      debtor_document: loan.debtorDocument,
      debtor_address: loan.debtorAddress,

      preferred_payment_method: loan.preferredPaymentMethod,
      pix_key: loan.pixKey,

      principal,
      original_principal: editingLoan ? originalPrincipal : principal,
      interest_rate: interestRate,
      juros_mensal_percent: interestRate,
      juros_aplicado: interestRate,
      fine_percent: finePercent,
      multa_percent: finePercent,
      daily_interest_percent: dailyInterestPercent,
      mora_diaria_percent: dailyInterestPercent,

      billing_cycle: loan.billingCycle,
      amortization_type: loan.amortizationType,
      start_date: loan.startDate,
      total_to_receive: isDailyFreePrincipalReduction ? safeFloat(editingLoan?.totalToReceive) : safeFloat(loan.totalToReceive),

      notes: loan.notes,
      guarantee_description: loan.guaranteeDescription,
      is_archived: loan.isArchived || false,
      skip_weekends: loan.skipWeekends || false,
      interest_free_installment: loan.interestFreeInstallment === true,

      funding_total_payable: loan.fundingTotalPayable,
      funding_cost: loan.fundingCost,
      funding_provider: loan.fundingProvider,
      funding_fee_percent: loan.fundingFeePercent,
      funding_calculation_mode: loan.fundingCalculationMode,
      funding_installments_count: loan.fundingInstallmentsCount,
      funding_monthly_rate: loan.fundingMonthlyRate,
      funding_installment_value: loan.fundingInstallmentValue,
      customer_margin_percent: loan.customerMarginPercent,
      customer_installment_value: loan.customerInstallmentValue,
      customer_total_payable: loan.customerTotalPayable,
      funding_payment_method: loan.fundingPaymentMethod,

      policies_snapshot: loan.policiesSnapshot,
      cliente_foto_url: loan.clientAvatarUrl,
    };

    if (editingLoan) {
      await runContractMutationWithSchemaFallback(loanPayload, (payload) =>
        supabase.from('contratos').update(payload).eq('id', safeUUID(loanId))
      );

      // ✅ parcelas = profile_id (conforme seu schema)
      // Na redução da Diária Livre, os valores financeiros ficam sob responsabilidade
      // da RPC atômica. Aqui persistimos somente eventual mudança de vencimento.
      if (isDailyFreePrincipalReduction && loan.installments?.length) {
        for (const inst of loan.installments) {
          const safeInstId = safeUUID(inst.id);
          if (!safeInstId) continue;
          const { error: dueDateError } = await supabase
            .from('parcelas')
            .update({ due_date: inst.dueDate, data_vencimento: inst.dueDate })
            .eq('id', safeInstId)
            .eq('loan_id', safeUUID(loanId));
          if (dueDateError) throw dueDateError;
        }
      } else if (loan.installments?.length) {
        const instPayload = loan.installments.map((inst, index) => ({
          id: ensureUUID(inst.id),
          loan_id: loanId,
          profile_id: ownerId,

          numero_parcela: (inst as any).number ?? (inst as any).numero_parcela ?? index + 1,
          data_vencimento: inst.dueDate,
          due_date: inst.dueDate,
          valor_parcela: safeFloat(inst.amount),

          // colunas extras (se existirem)
          amount: safeFloat(inst.amount),
          scheduled_principal: safeFloat(inst.scheduledPrincipal),
          scheduled_interest: safeFloat(inst.scheduledInterest),
          principal_remaining: safeFloat(inst.principalRemaining),
          interest_remaining: safeFloat(inst.interestRemaining),
          late_fee_accrued: safeFloat(inst.lateFeeAccrued),
        }));

        if (loan.billingCycle === 'INSTALLMENT_FIXED') {
          const { data: existingRows, error: existingRowsErr } = await supabase
            .from('parcelas')
            .select('id, numero_parcela')
            .eq('loan_id', safeUUID(loanId))
            .order('numero_parcela', { ascending: true });

          if (existingRowsErr) throw existingRowsErr;

          for (let index = 0; index < (existingRows || []).length; index++) {
            const row = existingRows[index] as any;
            const { error: tempNumberErr } = await supabase
              .from('parcelas')
              .update({ numero_parcela: 100000 + index })
              .eq('id', row.id);

            if (tempNumberErr) throw tempNumberErr;
          }
        }

        const { error: upsertErr } = await supabase.from('parcelas').upsert(instPayload, { onConflict: 'id' });
        if (upsertErr) throw upsertErr;
      }

      if (principalReduction > 0.005) {
        const stableRequest = getStableFinancialRequestKey(
          ['contract-principal-reduction', loanId, requestedPrincipal.toFixed(2), currentPrincipal.toFixed(2)].join(':')
        );
        const rpcPayload = {
          p_idempotency_key: stableRequest.idempotencyKey,
          p_loan_id: safeUUID(loanId),
          p_profile_id: safeUUID(ownerId),
          p_target_principal: requestedPrincipal,
          p_operator_id: safeUUID(activeUser.id),
          p_reason: isDailyFreePrincipalReduction
            ? 'Ajuste de capital pela edição da Diária Livre'
            : 'Abatimento de capital registrado na edição do contrato',
        };

        let reductionError: any = null;
        const { error: primaryErr } = await supabase.rpc('process_contract_principal_reduction_v1', rpcPayload);
        if (primaryErr) {
          if (isDailyFreePrincipalReduction) {
            const { error: dailyFreeErr } = await supabase.rpc('process_daily_free_principal_correction_v1', rpcPayload);
            reductionError = dailyFreeErr;
          } else {
            reductionError = primaryErr;
          }
        }

        if (reductionError) {
          const isRpcMissing = String(reductionError?.message || '').toLowerCase().includes('not found')
            || String(reductionError?.message || '').toLowerCase().includes('does not exist')
            || String(reductionError?.message || '').toLowerCase().includes('could not find');

          if (isRpcMissing) {
            await applyDirectPrincipalReductionFallback({
              loanId,
              ownerId,
              operatorId: safeUUID(activeUser.id),
              sourceId: safeUUID(loan.sourceId || editingLoan?.sourceId),
              currentPrincipal,
              requestedPrincipal,
              reductionAmount: principalReduction,
              editingLoan,
              idempotencyKey: stableRequest.idempotencyKey,
            });
          } else {
            throw new Error(`Não foi possível ajustar o capital com segurança: ${reductionError.message}`);
          }
        }
        clearStableFinancialRequestKey(stableRequest.storageKey);
      }

      if (additionalCapital > 0) {
        const targetInstallment = (editingLoan?.installments || []).find((installment: any) => {
          const status = String(installment.status || '').toUpperCase();
          const balance = Number(installment.principalRemaining ?? installment.principal_remaining ?? 0)
            + Number(installment.interestRemaining ?? installment.interest_remaining ?? 0)
            + Number(installment.lateFeeAccrued ?? installment.late_fee_accrued ?? 0);
          return canReceiveCapitalAdvance(status, balance);
        });
        const aporteSourceId = safeUUID(loan.sourceId || editingLoan?.sourceId);
        const aporteInstallmentId = safeUUID(targetInstallment?.id);
        if (!aporteSourceId || !aporteInstallmentId) throw new Error('Não foi possível identificar a fonte ou a parcela do aporte.');
        const requestKey = ['capital-advance', loanId, aporteInstallmentId, aporteSourceId, additionalCapital.toFixed(2), 'EDIT_CONTRACT'].join(':');
        const stableRequest = getStableFinancialRequestKey(requestKey);
        const { error: aporteError } = await supabase.rpc('process_lend_more_atomic', {
          p_idempotency_key: stableRequest.idempotencyKey,
          p_loan_id: safeUUID(loanId),
          p_profile_id: safeUUID(ownerId),
          p_amount: additionalCapital,
          p_source_id: aporteSourceId,
          p_installment_id: aporteInstallmentId,
          p_notes: 'Novo aporte incluído no ajuste do contrato',
          p_operator_id: safeUUID(activeUser.id),
          p_operation_type: 'NOVO_APORTE',
        });
        if (aporteError) throw new Error(`Erro ao registrar o novo aporte: ${aporteError.message}`);
        clearStableFinancialRequestKey(stableRequest.storageKey);
      }

    } else if (multiSourceAllocations.length > 1 || isWalletLinkedFunding) {
      const atomicAllocations = isWalletLinkedFunding
        ? [{ sourceId: safeUUID(loan.sourceId), amount: principal }]
        : multiSourceAllocations;
      const instPayload = (loan.installments || []).map((inst, index) => ({
        id: ensureUUID(inst.id),
        number: (inst as any).number ?? (inst as any).numero_parcela ?? index + 1,
        due_date: inst.dueDate,
        amount: safeFloat(inst.amount),
        scheduled_principal: safeFloat(inst.scheduledPrincipal),
        scheduled_interest: safeFloat(inst.scheduledInterest),
        principal_remaining: safeFloat(inst.principalRemaining),
        interest_remaining: safeFloat(inst.interestRemaining),
        late_fee_accrued: safeFloat(inst.lateFeeAccrued),
      }));
      const { error } = await supabase.rpc('create_contract_multi_source_v1', {
        p_contract: {
          ...loanPayload,
          profile_id: ownerId,
          source_id: safeUUID(atomicAllocations[0].sourceId),
          portal_token: loan.portalToken || generateUUID(),
          portal_shortcode: loan.portalShortcode || Math.floor(100000 + Math.random() * 900000).toString(),
          created_at: new Date().toISOString(),
        },
        p_installments: instPayload,
        p_allocations: atomicAllocations,
        p_profile_id: ownerId,
        p_operator_id: safeUUID(activeUser.id),
        p_debit_sources: true,
      });
      if (error) throw new Error(error.message);
    } else {
      await runContractMutationWithSchemaFallback({
        ...loanPayload,
        portal_token: loan.portalToken || generateUUID(),
        portal_shortcode: loan.portalShortcode || Math.floor(100000 + Math.random() * 900000).toString(),
        created_at: new Date().toISOString(),
      }, (payload) => supabase.from('contratos').insert(payload));

      if (loan.installments?.length) {
        const instPayload = loan.installments.map((inst, index) => ({
          id: ensureUUID(inst.id),
          loan_id: loanId,
          profile_id: ownerId,

          numero_parcela: (inst as any).number ?? (inst as any).numero_parcela ?? index + 1,
          data_vencimento: inst.dueDate,
          due_date: inst.dueDate,
          valor_parcela: safeFloat(inst.amount),

          amount: safeFloat(inst.amount),
          scheduled_principal: safeFloat(inst.scheduledPrincipal),
          scheduled_interest: safeFloat(inst.scheduledInterest),
          principal_remaining: safeFloat(inst.principalRemaining),
          interest_remaining: safeFloat(inst.interestRemaining),
          late_fee_accrued: safeFloat(inst.lateFeeAccrued),

          status: 'PENDENTE',
          paid_total: 0,
        }));

        const { error: instErr } = await supabase.from('parcelas').insert(instPayload);
        if (instErr) throw instErr;
      }

      // Saída de Caixa (novo contrato)
      const safeSrcId = safeUUID(loan.sourceId);
      if (safeSrcId && !options?.skipTransaction) {
        await adjustSourceBalanceSafe(safeSrcId, -principal);

        await supabase.from('transacoes').insert({
          id: generateUUID(),
          loan_id: safeUUID(loanId),
          profile_id: safeUUID(ownerId),
          source_id: safeSrcId,
          date: new Date().toISOString(),
          type: 'LOAN_INITIAL',
          amount: principal,
          principal_delta: 0,
          interest_delta: 0,
          late_fee_delta: 0,
          category: 'INVESTIMENTO',
          notes: 'Empréstimo Inicial',
        });
      }
    }

    return true;
  },

  async setCapitalOnlyRecovery(loan: Loan, enabled: boolean, activeUser: UserProfile) {
    const safeId = safeUUID(loan.id);
    if (!safeId) throw new Error('Contrato invalido.');
    if (!activeUser?.id) throw new Error('Usuario nao autenticado.');

    const { data, error } = await supabase.rpc('set_capital_only_recovery', {
      p_loan_id: safeId,
      p_enabled: enabled,
    });
    if (error) throw new Error('Nao foi possivel atualizar a condicao do contrato. Tente novamente.');
    if (!data?.ok || data.enabled !== enabled) throw new Error('Nao foi possivel confirmar a alteracao do contrato.');
    return data;
  },

  async assertClientCanBorrow(loan: Loan, existingLoans: Loan[]) {
    if (isCapitalOnlyRecoveryLoan(loan)) {
      throw new Error('Cliente marcado como Somente Capital nao pode receber novo emprestimo.');
    }

    const doc = onlyDigits(loan.debtorDocument);
    const name = String(loan.debtorName || '').trim().toLowerCase();
    const blocked = existingLoans.some((existing) => {
      if (!isCapitalOnlyRecoveryLoan(existing)) return false;
      if (loan.clientId && existing.clientId === loan.clientId) return true;
      if (doc && !isUnknownDocument(doc) && onlyDigits(existing.debtorDocument) === doc) return true;
      return !!name && String(existing.debtorName || '').trim().toLowerCase() === name;
    });

    if (blocked) {
      throw new Error('Cliente marcado como Somente Capital nao pode receber novo emprestimo.');
    }
  },

  async saveNote(loanId: string, note: string) {
    const safeId = safeUUID(loanId);
    if (!safeId) throw new Error('ID inválido.');

    try {
      const { syncService } = await import('./sync.service');
      await syncService.enqueueOperation({
        table: 'contratos',
        operation: 'UPDATE',
        data: { id: safeId, notes: note },
        id: safeId
      });
      return true;
    } catch (e) {
      console.error('[ContractsService] Erro ao salvar nota:', e);
      throw e;
    }
  },

  async addAporte(params: {
    loanId: string;
    amount: number;
    sourceId?: string;
    installmentId?: string;
    notes?: string;
    activeUser: UserProfile;
  }) {
    const { loanId, amount, sourceId, installmentId, notes, activeUser } = params;

    const ownerId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
    if (!ownerId) throw new Error('Perfil inválido.');

    const safeAmount = safeFloat(amount);
    if (safeAmount <= 0) throw new Error('Valor inválido.');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Conecte-se à internet para registrar este aporte com segurança.');
    }

    const stableRequest = getStableFinancialRequestKey(`capital-advance:${loanId}:${installmentId || 'auto'}:${sourceId || 'contract'}:${safeAmount.toFixed(2)}:NOVO_APORTE`);
    const { error } = await supabase.rpc('process_lend_more_atomic', {
      p_idempotency_key: stableRequest.idempotencyKey,
      p_loan_id: safeUUID(loanId),
      p_profile_id: safeUUID(ownerId),
      p_amount: safeAmount,
      p_source_id: safeUUID(sourceId),
      p_installment_id: safeUUID(installmentId),
      p_notes: notes || null,
      p_operator_id: safeUUID(activeUser.id),
      p_operation_type: 'NOVO_APORTE',
    });

    if (error) {
       throw new Error(`Erro ao aplicar aporte: ${error.message}`);
    }
    clearStableFinancialRequestKey(stableRequest.storageKey);
    return true;
  },

  async markAsBilled(loanId: string, currentCount: number = 0) {
    const safeId = safeUUID(loanId);
    if (!safeId) throw new Error('ID inválido.');

    const now = new Date().toISOString();
    const updatedData = {
      id: safeId,
      last_billed_at: now,
      billing_count: (currentCount || 0) + 1
    };

    try {
      const { db } = await import('./offline/adminOfflineStore');
      const { syncService } = await import('./sync.service');

      await db.contratos.update(safeId, updatedData);

      const { error: remoteError } = await supabase
        .from('contratos')
        .update({
          last_billed_at: now,
          billing_count: updatedData.billing_count
        })
        .eq('id', safeId);

      if (!remoteError) return true;

      console.warn('[ContractsService] Falha ao persistir cobranca imediatamente, enfileirando sync:', remoteError);
      await syncService.enqueueOperation({
        table: 'contratos',
        operation: 'UPDATE',
        data: updatedData,
        id: safeId
      });

      return true;
    } catch (e: any) {
      console.error('[ContractsService] Erro ao marcar cobrança:', e);
      throw e;
    }
  },
};
