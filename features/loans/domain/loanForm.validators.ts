import { CapitalSource } from '../../../types';
import { LoanFormState } from './loanForm.mapper';
import { translateBillingCycle } from '../../../utils/translationHelpers';
import { parseCurrency } from '../../../utils/formatters';
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
    const installmentValue = parseFloat(formData.fundingInstallmentValue || '');
    const mode = formData.fundingCalculationMode || 'TOTAL';

    if (!interestFreeInstallment) {
      if (isNaN(margin) || margin < 0) {
        return { isValid: false, error: "Erro: informe uma margem valida para o cliente." };
      }
    }
    if (fundingPaymentMethod === 'CREDIT_CARD' && mode === 'TOTAL' && String(formData.fundingTotalPayable ?? '').trim() !== '' && (isNaN(totalPayable) || totalPayable < principal)) {
      return { isValid: false, error: "Erro: o valor final do cartão deve ser maior ou igual ao principal." };
    }
    if (fundingPaymentMethod === 'CREDIT_CARD' && mode === 'RATE' && String(formData.fundingMonthlyRate ?? '').trim() !== '' && (isNaN(monthlyRate) || monthlyRate < 0)) {
      return { isValid: false, error: "Erro: informe a taxa mensal do cartão." };
    }
    if (fundingPaymentMethod === 'CREDIT_CARD' && mode === 'INSTALLMENT' && (isNaN(installmentValue) || installmentValue <= 0 || installmentValue * count < principal)) {
      return { isValid: false, error: "Erro: a parcela do cartão deve gerar um total maior ou igual ao principal." };
    }
  }

  if (!formData.startDate) {
    return { isValid: false, error: "Erro: A data do empréstimo é obrigatória." };
  }

  if (!formData.sourceId) {
    return { isValid: false, error: "Erro: A Carteira de Origem é obrigatória." };
  }
  if (!isEditing && (formData.fundingAllocations?.length || 0) > 1) {
    return { isValid: false, error: 'A composição por várias fontes está temporariamente indisponível. Selecione uma única fonte para emitir o contrato.' };
  }
  const selectedSource = sources.find(source => source.id === formData.sourceId);
  if (!isEditing && selectedSource?.type === 'CARD' && formData.fundingPaymentMethod === 'BANK_ACCOUNT_DEBIT') {
    return { isValid: false, error: 'A fonte selecionada é um cartão. Escolha pagamento no cartão ou outra fonte para débito em conta.' };
  }

  if (!isEditing && formData.cardPurchaseAlreadyCharged === true) {
    if (!selectedSource || !['CARD', 'MISTO'].includes(selectedSource.type)
      || (formData.fundingPaymentMethod || 'CREDIT_CARD') !== 'CREDIT_CARD'
      || (formData.fundingAllocations?.length || 0) !== 1) {
      return { isValid: false, error: 'A compra já cobrada só pode ser registrada com uma fonte vinculada a um único cartão.' };
    }
    const chargedAmount = parseCurrency(formData.cardPurchaseChargedAmount || '');
    const totalFinanced = parseCurrency(formData.fundingTotalPayable || formData.principal);
    if (!Number.isFinite(chargedAmount) || chargedAmount <= 0
      || Math.round(chargedAmount * 100) !== Math.round(totalFinanced * 100)) {
      return { isValid: false, error: 'Informe o valor exato cobrado pelo banco; deve coincidir com o total financiado.' };
    }
    const chargedDate = String(formData.cardPurchaseChargeDate || '');
    const date = new Date(chargedDate + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chargedDate)
      || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== chargedDate
      || date.getTime() > Date.now()
      || Date.now() - date.getTime() > 367 * 86400000) {
      return { isValid: false, error: 'Informe uma data válida de compra já realizada nos últimos 366 dias.' };
    }
    const bankReference = String(formData.cardPurchaseBankReference || '').trim();
    if (bankReference.length < 8 || bankReference.length > 160) {
      return { isValid: false, error: 'Informe uma identificação da compra bancária com 8 a 160 caracteres.' };
    }
  }

  // A taxa/custo do cartão é opcional: campo vazio equivale a custo zero.
  // Quando houver um total informado, ele nunca pode ser inferior ao capital.
  const hasFundingTotal = String(formData.fundingTotalPayable ?? '').trim() !== '';
  if (hasFundingTotal && !isEditing) {
    const fundingTotal = parseCurrency(formData.fundingTotalPayable);
    if (!Number.isFinite(fundingTotal) || fundingTotal < principal - 0.005) {
      return { isValid: false, error: 'O total financiado não pode ser menor que o capital entregue ao cliente.' };
    }
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
