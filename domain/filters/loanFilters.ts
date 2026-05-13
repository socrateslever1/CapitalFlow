
import { Loan, SortOption, LoanStatusFilter } from '../../types';
import { onlyDigits } from '../../utils/formatters';
import { resolveLoanVisualClassification } from '../../utils/loanFilterResolver';

// HELPER DE ORDENAÇÃO
const sortLoans = (loans: Loan[], sortOption: SortOption): Loan[] => {
    return [...loans].sort((a, b) => {
        switch (sortOption) {
            case 'NAME_ASC':
                return (a.debtorName || '').localeCompare(b.debtorName || '');
            
            case 'CREATED_DESC': // Entrada Mais Recente
                return new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime();
            
            case 'UPDATED_DESC': // Alterado Mais Recente (Baseado em Last Payment ou Update)
                const lastA = a.ledger && a.ledger.length > 0 ? new Date(a.ledger[a.ledger.length-1].date).getTime() : new Date(a.createdAt || a.startDate).getTime();
                const lastB = b.ledger && b.ledger.length > 0 ? new Date(b.ledger[b.ledger.length-1].date).getTime() : new Date(b.createdAt || b.startDate).getTime();
                return lastB - lastA;

            case 'DUE_DATE_ASC': // Vencimento Mais Próximo
            default:
                const nextA = a.installments.find(i => i.status !== 'PAID')?.dueDate || '9999-12-31';
                const nextB = b.installments.find(i => i.status !== 'PAID')?.dueDate || '9999-12-31';
                return new Date(nextA).getTime() - new Date(nextB).getTime();
        }
    });
};

const isUnifiedChildLoan = (loan: Loan): boolean => {
  const notes = String(loan.notes || '');
  return (
    notes.includes('[UNIFICADO EM') ||
    notes.includes('[LEGADO_PARCELAMENTO:') ||
    notes.includes('Contrato migrado para a unificação') ||
    notes.includes('Contrato unificado no parcelamento')
  );
};

export const filterLoans = (
  loans: Loan[],
  searchTerm: string,
  statusFilter: LoanStatusFilter,
  sortOption: SortOption = 'DUE_DATE_ASC'
): Loan[] => {
  let result = loans;
  
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    result = result.filter(l =>
      (l.debtorName || '').toLowerCase().includes(lower) ||
      String(l.debtorDocument || '').toLowerCase().includes(lower) ||
      String(l.debtorPhone || '').toLowerCase().includes(lower) ||
      String((l as any).debtorEmail || '').toLowerCase().includes(lower) ||
      String((l as any).debtorCode || '').toLowerCase().includes(lower) ||
      String((l as any).debtorClientNumber || '').toLowerCase().includes(lower) ||
      (onlyDigits(lower) && (
        onlyDigits(String(l.debtorDocument || '')).includes(onlyDigits(lower)) ||
        onlyDigits(String(l.debtorPhone || '')).includes(onlyDigits(lower)) ||
        onlyDigits(String((l as any).debtorCode || '')).includes(onlyDigits(lower)) ||
        onlyDigits(String((l as any).debtorClientNumber || '')).includes(onlyDigits(lower))
      ))
    );
  }

  // Lógica Centralizada de Status baseada no Resolver
  result = result.filter(loan => {
    const classification = resolveLoanVisualClassification(loan);

    // Se o contrato foi unificado em outro, ocultamos da listagem principal 
    // para evitar duplicidade visual, já que ele deve aparecer dentro do card da unificação.
    const isUnifiedChild = isUnifiedChildLoan(loan);
    if (isUnifiedChild) {
      return false;
    }

    switch (statusFilter) {
      case 'TODOS':
        return ['EM_DIA', 'ATRASADO', 'CRITICO', 'RENEGOCIADO'].includes(classification);
      
      case 'EM_DIA':
        return classification === 'EM_DIA';
      
      case 'ATRASADOS':
        return classification === 'ATRASADO';
      
      case 'ATRASO_CRITICO':
        return classification === 'CRITICO';
      
      case 'QUITADO':
      case 'PAGOS': // Mantendo compatibilidade temporária
        return classification === 'QUITADO';
      
      case 'RENEGOCIADO':
        return classification === 'RENEGOCIADO';

      case 'ARQUIVADOS':
        return classification === 'ARQUIVADO';

      default:
        return false;
    }
  });
  
  // Aplica ordenação ao final
  return sortLoans(result, sortOption);
};
