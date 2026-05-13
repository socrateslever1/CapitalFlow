
// services/ledger/ledgerAudit.ts
import { supabase } from '../../lib/supabase';
import { generateUUID } from '../../utils/generators';
import { safeUUID } from '../../utils/uuid';

export async function logArchive(ownerId: string, loanId: string, sourceId?: string | null) {
  const { error } = await supabase.from('transacoes').insert([
    {
      id: generateUUID(),
      loan_id: safeUUID(loanId),
      profile_id: safeUUID(ownerId),
      source_id: safeUUID(sourceId),
      date: new Date().toISOString(),
      type: 'ARCHIVE',
      amount: 0,
      principal_delta: 0,
      interest_delta: 0,
      late_fee_delta: 0,
      notes: 'Contrato Arquivado',
      category: 'GERAL',
    },
  ]);
  if (error) throw error;
}

export async function logRestore(ownerId: string, loanId: string, sourceId?: string | null) {
  const { error } = await supabase.from('transacoes').insert([
    {
      id: generateUUID(),
      loan_id: safeUUID(loanId),
      profile_id: safeUUID(ownerId),
      source_id: safeUUID(sourceId),
      date: new Date().toISOString(),
      type: 'RESTORE',
      amount: 0,
      principal_delta: 0,
      interest_delta: 0,
      late_fee_delta: 0,
      notes: 'Contrato Restaurado',
      category: 'GERAL',
    },
  ]);
  if (error) throw error;
}

/**
 * Log auditável do estorno:
 * - Registra valores negativos para balancear o ledger (somas)
 * - category='ESTORNO'
 */
export async function logReversalAudit(params: {
  ownerId: string;
  loanId: string;
  sourceId: string | null;
  installmentId: string | null;
  originalTxId: string;
  originalType: string;
  amount: number; // Total negativo da transação
  reversedPrincipal: number; // Principal negativo
  reversedProfit: number; // Juros negativo
  notes?: string;
}) {
  const { ownerId, loanId, sourceId, installmentId, originalTxId, originalType, amount, reversedPrincipal, reversedProfit, notes } = params;

  const { error } = await supabase.from('transacoes').insert({
    id: generateUUID(),
    loan_id: safeUUID(loanId),
    profile_id: safeUUID(ownerId),
    source_id: safeUUID(sourceId),
    installment_id: safeUUID(installmentId),
    date: new Date().toISOString(),
    type: 'ESTORNO',
    amount: amount, // Valor negativo para anular a soma
    principal_delta: reversedPrincipal,
    interest_delta: reversedProfit,
    late_fee_delta: 0,
    category: 'ESTORNO', // Categoria específica
    notes:
      `Estorno aplicado. Ref=${originalTxId}` +
      (notes ? ` | Obs Original: ${notes}` : ''),
  });

  if (error) throw error;
}
