import { CapitalSource } from '../../../types';
import { LoanFormState } from './loanForm.mapper';
import { translateBillingCycle } from '../../../utils/translationHelpers';
import { validateFundingAllocations } from '../../../domain/finance/fundingAllocations';

export const validateLoanForm = (
  formData: LoanFormState,
  sources: CapitalSource[],
  isEditing: boolean
): { isValid: boolean; error?: string } => {

  if (!formData.debtorName.trim()) {
    return { isValid: false, error: "Erro: O nome do devedor é obrigatório." };
  }

  if (!formData.debtorPhone.trim()) {
    return { isValid: false, error: "Erro: O telefone do devedor é obrigatório para contato." };
  }

  if (!formData.debtorDocument.trim()) {
    return { isValid: false, error: "Erro: O documento (CPF/CNPJ) do devedor é obrigatório." };
  }

  const principal = parseFloat(formData.principal);
  if (isNaN(principal) || principal <= 0) {
    return { isValid: false, error: "Erro: O valor Principal deve ser maior que zero." };
  }

  const rate = parseFloat(formData.interestRate);
  if(formData.billingCycle !== 'INSTALLMENT_FIXED' && (isNaN(rate) || rate <= 0)) {
    return { isValid: false, error: "Erro: A Taxa de Juros deve ser maior que zero." };
  }
  if (formData.billingCycle === 'INSTALLMENT_FIXED') {
    const count = parseInt(formData.fundingInstallmentsCount || '', 10);
    const interestFreeInstallment = formData.interestFreeInstallment === true;
    const fundingPaymentMethod = formData.fundingPaymentMethod || 'CREDIT_CARD';

    if (isNaN(count) || count <= 0) {
      return { isValid: false, error: "Erro: informe a quantidade de parcelas." };
    }

    const margin = parseFloat(formData.customerMarginPercent || '');
    const totalPayable = parseFloat(formData.fundingTotalPayable || '');
    const monthlyRate = parseFloat(formData.fundingMonthlyRate || '');
    const mode = formData.fundingCalculationMode || 'TOTAL';

    if (!interestFreeInstallment) {
      if (isNaN(margin) || margin < 0) {
        return { isValid: false, error: "Erro: informe uma margem valida para o cliente." };
      }
    }
    if (fundingPaymentMethod === 'CREDIT_CARD' && mode === 'TOTAL' && (isNaN(totalPayable) || totalPayable < principal)) {
      return { isValid: false, error: "Erro: o valor final do cartão deve ser maior ou igual ao principal." };
    }
    if (fundingPaymentMethod === 'CREDIT_CARD' && mode === 'RATE' && (isNaN(monthlyRate) || monthlyRate < 0)) {
      return { isValid: false, error: "Erro: informe a taxa mensal do cartão." };
    }
  }

  if (!formData.startDate) {
    return { isValid: false, error: "Erro: A data do empréstimo é obrigatória." };
  }

  if (!formData.sourceId) {
    return { isValid: false, error: "Erro: A Carteira de Origem é obrigatória." };
  }

  if (formData.fundingAllocations?.length) {
    const singleSource = formData.fundingAllocations.length === 1;
    const allocationCheck = validateFundingAllocations(principal, formData.fundingAllocations.map((allocation) => ({
      sourceId: allocation.sourceId,
      amount: singleSource ? principal : Number(String(allocation.amount).replace(',', '.')),
    })));
    if ('error' in allocationCheck) return { isValid: false, error: allocationCheck.error };
    for (const allocation of allocationCheck.allocations) {
      const source = sources.find((item) => item.id === allocation.sourceId);
      if (!source) return { isValid: false, error: 'Uma das fontes selecionadas não está disponível.' };
    }
  }

  const officialModalities = ['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'INSTALLMENT_FIXED', 'DAILY_FREE', 'DAILY_FIXED_TERM'];
  if (!officialModalities.includes(formData.billingCycle)) {
    return { isValid: false, error: `Erro: A modalidade ${translateBillingCycle(formData.billingCycle)} não é uma modalidade oficial suportada para novos contratos.` };
  }

  return { isValid: true };
};
