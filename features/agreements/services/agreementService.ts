import { supabase } from "../../../lib/supabase";
import { generateUUID } from "../../../utils/generators";
import { safeUUID } from "../../../utils/uuid";
import { agreementService as legacyAgreementService } from "./agreementService.legacy";

const agreementPaymentInFlight = new Map<string, Promise<void>>();
const STORAGE_PREFIX = "capitalflow:agreement-payment:";

function normalizeMoney(value: unknown): number {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function getAgreementId(agreement: any): string {
  return String(agreement?.id || agreement?.acordo_id || "").trim();
}

function getInstallmentId(installment: any): string {
  return String(installment?.id || "").trim();
}

function getRequestSignature(
  agreementId: string,
  installmentId: string,
  amount: number,
  forgiveLateFee: boolean,
): string {
  return `${agreementId}:${installmentId}:${amount.toFixed(2)}:${forgiveLateFee ? "1" : "0"}`;
}

function getStoredRequestKey(signature: string): { idempotencyKey: string; storageKey: string | null } {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return { idempotencyKey: generateUUID(), storageKey: null };
  }

  const storageKey = `${STORAGE_PREFIX}${signature}`;
  try {
    const current = window.sessionStorage.getItem(storageKey);
    if (current) return { idempotencyKey: current, storageKey };

    const idempotencyKey = generateUUID();
    window.sessionStorage.setItem(storageKey, idempotencyKey);
    return { idempotencyKey, storageKey };
  } catch {
    return { idempotencyKey: generateUUID(), storageKey: null };
  }
}

function clearStoredRequestKey(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Storage is only an idempotency aid. A storage failure must not fail a payment.
  }
}

function rpcErrorMessage(operation: string, error: any): string {
  const code = String(error?.code || "").trim();
  const detail = String(error?.message || error?.details || "erro desconhecido").trim();
  return `${operation} bloqueada pelo backend financeiro${code ? ` (${code})` : ""}: ${detail}`;
}

async function processPaymentAtomic(
  agreement: any,
  installment: any,
  amount: number,
  _sourceId: string,
  activeUser: any,
  forgiveLateFee = false,
): Promise<void> {
  const agreementId = safeUUID(getAgreementId(agreement));
  const installmentId = safeUUID(getInstallmentId(installment));
  const paymentAmount = normalizeMoney(amount);
  const operatorId = safeUUID(activeUser?.id) || safeUUID(activeUser?.profile_id) || null;

  if (!agreementId) throw new Error("Acordo inválido.");
  if (!installmentId) throw new Error("Parcela do acordo inválida.");
  if (paymentAmount <= 0) throw new Error("O valor do pagamento deve ser maior que zero.");

  const signature = getRequestSignature(agreementId, installmentId, paymentAmount, forgiveLateFee);
  const existing = agreementPaymentInFlight.get(signature);
  if (existing) return existing;

  const { idempotencyKey, storageKey } = getStoredRequestKey(signature);

  const request = (async () => {
    const { error } = await supabase.rpc("process_agreement_payment_atomic", {
      p_idempotency_key: idempotencyKey,
      p_agreement_id: agreementId,
      p_installment_id: installmentId,
      p_amount: paymentAmount,
      p_operator_id: operatorId,
      p_forgive_late_fee: !!forgiveLateFee,
      p_payment_date: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      // Fail closed: never fall back to the legacy multi-step mutation path.
      // Keep the request key in sessionStorage so a retry remains idempotent.
      throw new Error(rpcErrorMessage("Pagamento de acordo", error));
    }

    clearStoredRequestKey(storageKey);
  })();

  agreementPaymentInFlight.set(signature, request);
  try {
    await request;
  } finally {
    agreementPaymentInFlight.delete(signature);
  }
}

async function reversePaymentAtomic(
  agreement: any,
  installment: any,
  activeUser: any,
  reason = "Estorno solicitado pelo operador",
): Promise<void> {
  const agreementId = safeUUID(getAgreementId(agreement));
  const installmentId = safeUUID(getInstallmentId(installment));
  const operatorId = safeUUID(activeUser?.id) || safeUUID(activeUser?.profile_id) || null;

  if (!agreementId || !installmentId) throw new Error("Acordo ou parcela inválida.");

  const { error } = await supabase.rpc("reverse_agreement_payment_atomic", {
    p_agreement_id: agreementId,
    p_installment_id: installmentId,
    p_operator_id: operatorId,
    p_reason: String(reason || "Estorno solicitado pelo operador").slice(0, 500),
  });

  if (error) {
    throw new Error(rpcErrorMessage("Estorno de acordo", error));
  }
}

async function breakAgreementAtomic(agreementIdValue: string): Promise<void> {
  const agreementId = safeUUID(agreementIdValue);
  if (!agreementId) throw new Error("ID do acordo inválido.");

  const { error } = await supabase.rpc("break_agreement_atomic", {
    p_agreement_id: agreementId,
  });

  if (error) {
    throw new Error(rpcErrorMessage("Quebra de acordo", error));
  }
}

/**
 * Public agreement service.
 *
 * The legacy module remains only for non-payment agreement operations. All financial
 * mutations fail closed through transactional database RPCs; there is no client-side
 * fallback capable of partially mutating installments, balances or the ledger.
 */
export const agreementService = {
  ...legacyAgreementService,
  processPayment: processPaymentAtomic,
  reversePayment: reversePaymentAtomic,
  breakAgreement: breakAgreementAtomic,
};
