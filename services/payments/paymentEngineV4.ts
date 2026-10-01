import { supabase } from '../../lib/supabase';
import { generateUUID } from '../../utils/generators';
import { safeUUID } from '../../utils/uuid';

export type FinancialOperationType =
  | 'KEEP_PENDING'
  | 'RENEW_KEEP_PENDING'
  | 'CAPITALIZE'
  | 'SETTLE';

export type FinancialPaymentMethod =
  | 'PIX'
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CREDIT_CARD'
  | 'BOLETO'
  | 'OTHER';

export type FinancialOperationInput = {
  loanId: string;
  installmentId: string;
  operationType: FinancialOperationType;
  amountReceived: number;
  paymentMethod: FinancialPaymentMethod;
  paymentDate: string;
  competenceDate?: string | null;
  forgivenessMode?: string;
  requestedLateFeeForgiven?: number;
  manualDueDate?: string | null;
  caixaLivreId?: string | null;
  reason?: string | null;
  expectedPreview?: FinancialOperationResult | null;
};

export type FinancialOperationResult = {
  success: true;
  operation_id?: string;
  idempotency_key?: string;
  idempotent_replay?: boolean;
  operation_type: FinancialOperationType;
  payment_method: FinancialPaymentMethod;
  amount_received: number;
  principal_paid: number;
  interest_paid: number;
  late_fee_paid: number;
  principal_forgiven: number;
  interest_forgiven: number;
  late_fee_forgiven: number;
  amount_capitalized: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const requestInFlight = new Map<string, Promise<FinancialOperationResult>>();
const STORAGE_PREFIX = 'capitalflow:financial-operation-v4:';

function normalizeMoney(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function financialOperationError(error: unknown, action: 'PREVIEW' | 'EXECUTE') {
  const message = String((error as any)?.message || error || '');

  if (/payment_transactions_operator_profile_id_fkey|operator_profile_id/i.test(message)) {
    return 'Não foi possível identificar o responsável pelo recebimento. Atualize a página e tente novamente.';
  }
  if (/permission|permiss[aã]o|access denied|acesso negado|jwt|auth/i.test(message)) {
    return 'Sua sessão não tem permissão para concluir este recebimento. Entre novamente ou procure o administrador.';
  }
  if (/posição financeira mudou|posicao financeira mudou|expected_preview|prévia|previa/i.test(message)) {
    return 'Os valores desta parcela mudaram durante a confirmação. Revise os dados atualizados antes de continuar.';
  }
  if (/failed to fetch|network|fetch|connection|conex[aã]o/i.test(message)) {
    return 'Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.';
  }
  if (/fonte de capital|caixa livre/i.test(message)) {
    return 'A carteira vinculada a este contrato precisa ser revisada antes de registrar o recebimento.';
  }

  return action === 'PREVIEW'
    ? 'Não foi possível preparar a revisão deste recebimento. Atualize a parcela e tente novamente.'
    : 'Não foi possível registrar o recebimento. Nenhum valor foi alterado; tente novamente.';
}

function requestSignature(input: FinancialOperationInput) {
  return [
    input.loanId,
    input.installmentId,
    input.operationType,
    normalizeMoney(input.amountReceived).toFixed(2),
    input.paymentMethod,
    input.paymentDate,
    input.competenceDate || input.paymentDate,
    input.forgivenessMode || 'NONE',
    normalizeMoney(input.requestedLateFeeForgiven).toFixed(2),
    input.manualDueDate || '',
  ].join(':');
}

export function getStableFinancialRequestKey(signature: string) {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return { idempotencyKey: generateUUID(), storageKey: null as string | null };
  }

  const storageKey = `${STORAGE_PREFIX}${signature}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return { idempotencyKey: existing, storageKey };
    const idempotencyKey = generateUUID();
    window.sessionStorage.setItem(storageKey, idempotencyKey);
    return { idempotencyKey, storageKey };
  } catch {
    return { idempotencyKey: generateUUID(), storageKey: null as string | null };
  }
}

export function clearStableFinancialRequestKey(storageKey: string | null) {
  if (!storageKey || typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    return;
  }
}

function rpcArgs(input: FinancialOperationInput) {
  const loanId = safeUUID(input.loanId);
  const installmentId = safeUUID(input.installmentId);
  if (!loanId || !installmentId) throw new Error('Contrato ou parcela inválida.');
  if (normalizeMoney(input.amountReceived) <= 0) throw new Error('O valor recebido deve ser maior que zero.');

  return {
    p_loan_id: loanId,
    p_installment_id: installmentId,
    p_operation_type: input.operationType,
    p_amount_received: normalizeMoney(input.amountReceived),
    p_payment_method: input.paymentMethod,
    p_payment_date: input.paymentDate,
    p_competence_date: input.competenceDate || input.paymentDate,
    p_forgiveness_mode: input.forgivenessMode || 'NONE',
    p_requested_late_fee_forgiven: normalizeMoney(input.requestedLateFeeForgiven),
    p_manual_due_date: input.manualDueDate || null,
  };
}

export async function previewFinancialOperation(
  input: FinancialOperationInput,
): Promise<FinancialOperationResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Conecte-se à internet para revisar os valores deste recebimento.');
  }

  const { data, error } = await supabase.rpc('preview_financial_operation_v4', rpcArgs(input));
  if (error) {
    console.error('[PaymentEngineV4] Falha ao preparar recebimento:', error);
    throw new Error(financialOperationError(error, 'PREVIEW'));
  }
  if (!(data as any)?.success) throw new Error('Não foi possível preparar a revisão deste recebimento.');
  return data as FinancialOperationResult;
}

export async function executeFinancialOperation(
  input: FinancialOperationInput,
): Promise<FinancialOperationResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Conecte-se à internet para registrar este recebimento com segurança.');
  }
  if (!input.expectedPreview) {
    throw new Error('Revise os valores antes de concluir o recebimento.');
  }

  const signature = requestSignature(input);
  const existing = requestInFlight.get(signature);
  if (existing) return existing;

  const { idempotencyKey, storageKey } = getStableFinancialRequestKey(signature);
  const request = (async () => {
    const { data, error } = await supabase.rpc('process_financial_operation_v4', {
      p_idempotency_key: idempotencyKey,
      ...rpcArgs(input),
      p_caixa_livre_id: safeUUID(input.caixaLivreId),
      p_reason: input.reason || null,
      p_expected_preview: input.expectedPreview,
    });

    if (error) {
      console.error('[PaymentEngineV4] Falha ao registrar recebimento:', error);
      throw new Error(financialOperationError(error, 'EXECUTE'));
    }
    if (!(data as any)?.success) throw new Error('Não foi possível registrar o recebimento. Nenhum valor foi alterado.');
    clearStableFinancialRequestKey(storageKey);
    return data as FinancialOperationResult;
  })();

  requestInFlight.set(signature, request);
  try {
    return await request;
  } finally {
    requestInFlight.delete(signature);
  }
}

export async function reverseFinancialOperation(
  originalIdempotencyKey: string,
  reason: string,
) {
  const originalKey = safeUUID(originalIdempotencyKey);
  if (!originalKey) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Conecte-se à internet para realizar o estorno com segurança.');
  }

  const reversalRequest = getStableFinancialRequestKey(`financial-reversal:${originalKey}:${String(reason || '').trim()}`);
  const { data, error } = await supabase.rpc('reverse_financial_operation_v4', {
    p_original_idempotency_key: originalKey,
    p_reversal_idempotency_key: reversalRequest.idempotencyKey,
    p_reason: String(reason || '').trim(),
  });

  if (error && /nao encontrada|não encontrada/i.test(error.message || '')) return null;
  if (error) {
    console.error('[PaymentEngineV4] Falha ao estornar recebimento:', error);
    throw new Error(financialOperationError(error, 'EXECUTE'));
  }
  if (!(data as any)?.success) throw new Error('Não foi possível concluir o estorno. Nenhum valor foi alterado.');
  clearStableFinancialRequestKey(reversalRequest.storageKey);
  return data;
}
