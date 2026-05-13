import { CapitalSource } from '../../../types';
import { LoanFormState } from './loanForm.mapper';

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
  if(isNaN(rate) || rate <= 0) { 
    return { isValid: false, error: "Erro: A Taxa de Juros deve ser maior que zero." }; 
  }

  if (!formData.startDate) { 
    return { isValid: false, error: "Erro: A data do empréstimo é obrigatória." }; 
  }

  if (!formData.sourceId) {
    return { isValid: false, error: "Erro: A Carteira de Origem é obrigatória." };
  }

  const officialModalities = ['MONTHLY', 'DAILY_FREE', 'DAILY_FIXED_TERM'];
  if (!officialModalities.includes(formData.billingCycle)) {
    return { isValid: false, error: `Erro: A modalidade ${formData.billingCycle} não é uma modalidade oficial suportada para novos contratos.` };
  }

  return { isValid: true };
};
