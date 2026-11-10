import type { CapitalSource } from '../../../types';
import type { LoanFormState } from './loanForm.mapper';
import { parseCurrency } from '../../../utils/formatters';

/**
 * Omissão do custo de captação em origem cartão não é erro: equivale a
 * tarifa/juros zero. Persistimos explicitamente o total (principal) e taxa 0
 * para auditoria, sem alterar juros cobrados do cliente ou outros tipos de fonte.
 */
export function normalizeOptionalCardFunding(
  form: LoanFormState,
  sourceType: CapitalSource['type'] | undefined,
  isEditing: boolean,
): LoanFormState {
  if (isEditing || form.billingCycle === 'INSTALLMENT_FIXED' ||
      sourceType !== 'CARD' ||
      String(form.fundingTotalPayable ?? '').trim() !== '') {
    return form;
  }
  const principal = parseCurrency(form.principal);
  if (!Number.isFinite(principal) || principal <= 0) return form;
  return {
    ...form,
    fundingTotalPayable: principal.toFixed(2),
    fundingFeePercent: '0',
    fundingPaymentMethod: 'CREDIT_CARD',
    fundingCalculationMode: 'TOTAL',
  };
}
