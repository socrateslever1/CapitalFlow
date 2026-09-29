import type { Loan } from '../../types';
import { resolveLoanVisualClassification } from '../../utils/loanFilterResolver';

export function getActiveSourceLoans(loans: Loan[], sourceId: string): Loan[] {
  return loans.filter((loan) => {
    const linkedSourceId = String((loan as any).sourceId || (loan as any).source_id || '');
    if (linkedSourceId !== sourceId) return false;

    const classification = resolveLoanVisualClassification(loan);
    return !['QUITADO', 'ARQUIVADO', 'IGNORAR'].includes(classification);
  });
}
