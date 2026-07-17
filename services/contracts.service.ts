// services/contracts.service.ts
import { supabase } from '../lib/supabase';
import { UserProfile, Loan, CapitalSource } from '../types';
import { generateUUID } from '../utils/generators';
import { isUUID, safeUUID } from '../utils/uuid';
import {
  addCapitalOnlyRecoveryMarker,
  isCapitalOnlyRecoveryLoan,
  removeCapitalOnlyRecoveryMarker,
} from '../utils/capitalOnlyRecovery';
import { isTestSource } from '../utils/testSource';

/* =========================
   Helpers de Sanitização
========================= */
const ensureUUID = (v: any) => (isUUID(v) ? v : generateUUID());

const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');

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
      if (cleanDoc && cleanDoc.length >= 11) {
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
    const principal = safeFloat(loan.principal);
    const selectedSource = _sources.find((source) => source.id === loan.sourceId);
    const isTestWalletLoan = isTestSource(selectedSource);

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
      interest_rate: safeFloat(loan.interestRate),
      fine_percent: safeFloat(loan.finePercent),
      daily_interest_percent: safeFloat(loan.dailyInterestPercent),

      billing_cycle: loan.billingCycle,
      amortization_type: loan.amortizationType,
      start_date: loan.startDate,
      total_to_receive: safeFloat(loan.totalToReceive),

      notes: loan.notes,
      guarantee_description: loan.guaranteeDescription,
      is_archived: loan.isArchived || false,
      skip_weekends: loan.skipWeekends || false,

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

      policies_snapshot: loan.policiesSnapshot,
      cliente_foto_url: loan.clientAvatarUrl,
    };

    if (editingLoan) {
      await runContractMutationWithSchemaFallback(loanPayload, (payload) =>
        supabase.from('contratos').update(payload).eq('id', safeUUID(loanId))
      );

      // ✅ parcelas = profile_id (conforme seu schema)
      if (loan.installments?.length) {
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
    } else {
      await runContractMutationWithSchemaFallback({
        ...loanPayload,
        portal_token: loan.portalToken || crypto.randomUUID(),
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
      if (safeSrcId && !options?.skipTransaction && !isTestWalletLoan) {
        await supabase.rpc('adjust_source_balance', { p_source_id: safeSrcId, p_delta: -principal });

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
    const ownerId = safeUUID((activeUser as any)?.supervisor_id) || safeUUID(activeUser?.id);
    if (!safeId) throw new Error('Contrato invalido.');
    if (!ownerId) throw new Error('Perfil invalido.');

    const nextNotes = enabled
      ? addCapitalOnlyRecoveryMarker(loan.notes)
      : removeCapitalOnlyRecoveryMarker(loan.notes);

    const { error: loanError } = await supabase
      .from('contratos')
      .update({
        notes: nextNotes,
        interest_rate: enabled ? 0 : loan.interestRate,
        fine_percent: enabled ? 0 : loan.finePercent,
        daily_interest_percent: enabled ? 0 : loan.dailyInterestPercent,
      })
      .eq('id', safeId);

    if (loanError) throw new Error(loanError.message);

    if (enabled) {
      const { error: installmentsError } = await supabase
        .from('parcelas')
        .update({
          interest_remaining: 0,
          late_fee_accrued: 0,
          scheduled_interest: 0,
        })
        .eq('loan_id', safeId);

      if (installmentsError) throw new Error(installmentsError.message);
    }

    await supabase.from('transacoes').insert({
      id: generateUUID(),
      loan_id: safeId,
      profile_id: ownerId,
      date: new Date().toISOString(),
      type: enabled ? 'CAPITAL_ONLY_RECOVERY_ENABLED' : 'CAPITAL_ONLY_RECOVERY_DISABLED',
      amount: 0,
      principal_delta: 0,
      interest_delta: 0,
      late_fee_delta: 0,
      category: 'INFO',
      notes: enabled
        ? 'Contrato marcado como Somente Capital. Recebimentos futuros recuperam apenas o principal.'
        : 'Marcacao Somente Capital removida.'
    });

    return true;
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
      if (doc && onlyDigits(existing.debtorDocument) === doc) return true;
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

    // ✅ aqui é isso mesmo: p_profile_id = ownerId
    console.log('[DEBUG] addAporte params:', {
      loanId: safeUUID(loanId),
      ownerId: safeUUID(ownerId),
      amount: safeAmount,
      sourceId: safeUUID(sourceId),
      installmentId: safeUUID(installmentId)
    });
    const { error } = await supabase.rpc('apply_new_aporte_atomic', {
      p_loan_id: safeUUID(loanId),
      p_profile_id: safeUUID(ownerId),
      p_amount: safeAmount,
      p_source_id: safeUUID(sourceId),
      p_installment_id: safeUUID(installmentId),
      p_notes: notes || null,
      p_operator_id: safeUUID(activeUser.id),
    });

    if (error) {
       console.error('[DEBUG] RPC Error:', error, { loanId, ownerId });
       throw new Error(`Erro ao aplicar aporte: ${error.message} (Loan ID: ${loanId}, Owner ID: ${ownerId})`);
    }
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
