import type { FinancialOperationType } from './paymentEngineV4';

export type ReceiptBusinessAction =
  | 'AUTOMATIC'
  | 'CAPITALIZE_REMAINDER'
  | 'KEEP_REMAINDER_PENDING'
  | 'RENEW_WITH_DISCOUNT'
  | 'PRINCIPAL_REDUCTION';

export type ReceiptDecisionInput = {
  amountReceived: number;
  principal: number;
  interest: number;
  lateFee: number;
  billingCycle?: string | null;
  businessAction?: ReceiptBusinessAction;
};

export type ReceiptDecision = {
  action: ReceiptBusinessAction;
  operationType: FinancialOperationType;
  isRecurring: boolean;
  needsBusinessChoice: boolean;
};

const EPSILON = 0.05;
const RECURRING_CYCLES = new Set(['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'GIRO', 'REVOLVING']);

export function isRecurringReceiptCycle(billingCycle?: string | null) {
  return RECURRING_CYCLES.has(String(billingCycle || '').toUpperCase());
}

export function resolveReceiptDecision(input: ReceiptDecisionInput): ReceiptDecision {
  const amount = Math.max(0, Number(input.amountReceived) || 0);
  const principal = Math.max(0, Number(input.principal) || 0);
  const interest = Math.max(0, Number(input.interest) || 0);
  const lateFee = Math.max(0, Number(input.lateFee) || 0);
  const total = principal + interest + lateFee;
  const isRecurring = isRecurringReceiptCycle(input.billingCycle);

  if (input.businessAction === 'PRINCIPAL_REDUCTION') {
    return { action: input.businessAction, operationType: 'PRINCIPAL_REDUCTION', isRecurring, needsBusinessChoice: false };
  }

  if (!isRecurring || amount >= total - EPSILON) {
    return { action: 'AUTOMATIC', operationType: 'KEEP_PENDING', isRecurring, needsBusinessChoice: false };
  }

  if (interest + lateFee <= EPSILON && amount < principal - EPSILON) {
    return { action: 'AUTOMATIC', operationType: 'PRINCIPAL_REDUCTION', isRecurring, needsBusinessChoice: false };
  }

  if (input.businessAction === 'CAPITALIZE_REMAINDER') {
    return { action: input.businessAction, operationType: 'CAPITALIZE_RENEWAL', isRecurring, needsBusinessChoice: false };
  }
  if (input.businessAction === 'KEEP_REMAINDER_PENDING') {
    return { action: input.businessAction, operationType: 'KEEP_PENDING', isRecurring, needsBusinessChoice: false };
  }
  if (input.businessAction === 'RENEW_WITH_DISCOUNT') {
    return { action: input.businessAction, operationType: 'DISCOUNT_RENEWAL', isRecurring, needsBusinessChoice: false };
  }

  if (amount < interest - EPSILON) {
    return { action: 'CAPITALIZE_REMAINDER', operationType: 'CAPITALIZE_RENEWAL', isRecurring, needsBusinessChoice: true };
  }

  return { action: 'AUTOMATIC', operationType: 'RENEW_KEEP_PENDING', isRecurring, needsBusinessChoice: false };
}
