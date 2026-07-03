import { Loan, SortOption } from '../../types';
import { rebuildLoanStateFromLedger } from '../../domain/finance/calculations';
import { loanEngine } from '../../domain/loanEngine';
import { resolveLoanVisualClassification, getLoanNextDueDate } from '../../utils/loanFilterResolver';
import { normalizeName, onlyDigits } from '../../utils/formatters';
import { isCapitalOnlyRecoveryLoan } from '../../utils/capitalOnlyRecovery';

export interface ClientGroup {
  id: string; // Unique ID for the group
  clientId: string;
  clientName: string;
  avatarUrl?: string;
  loans: Loan[];
  totalDebt: number;
  totalMonthlyDue: number;
  status: 'CRITICAL' | 'LATE' | 'WARNING' | 'OK' | 'PAID';
  hasCapitalOnlyRecovery?: boolean;
  contractCount: number;
  isStandalone: boolean; // Indica se possui apenas um contrato
  // Metadados internos para ordenação
  _sortMeta?: {
      minDueDate: number;
      maxCreatedAt: number;
      maxUpdatedAt: number;
  };
}

/**
 * Agrupa contratos.
 * REGRA DO OPERADOR: Se o contrato tem um ClientID vinculado, agrupa pelo ID (soberania do cadastro).
 * Se não tem ID (contrato avulso), agrupa pelo nome normalizado.
 */
export const groupLoansByClient = (loans: Loan[], sortOption: SortOption = 'DUE_DATE_ASC'): ClientGroup[] => {
  const groups: Record<string, ClientGroup> = {};
  
  loans.forEach(loanRaw => {
    const loan = rebuildLoanStateFromLedger(loanRaw);
    const rawId = loan.clientId;
    const rawName = (loan.debtorName || 'Cliente Desconhecido').trim();
    const rawDoc = onlyDigits(loan.debtorDocument);
    const ownerId = loan.owner_id || 'no-owner';
    
    // BUG 2: Regra de agrupamento robusta (Multi-tenant + ID > DOC > NOME)
    let groupKey = `${ownerId}|`;
    if (rawId && rawId !== 'no-id') {
        groupKey += `id_${rawId}`;
    } else if (rawDoc && rawDoc.length >= 11) {
        groupKey += `doc_${rawDoc}`;
    } else {
        groupKey += `name_${normalizeName(rawName)}`;
    }

    if (!groups[groupKey]) {
      groups[groupKey] = {
        id: groupKey,
        clientId: rawId || '',
        clientName: rawName,
        avatarUrl: loan.clientAvatarUrl,
        loans: [],
        totalDebt: 0,
        totalMonthlyDue: 0,
        status: 'OK',
        hasCapitalOnlyRecovery: false,
        contractCount: 0,
        isStandalone: false
      };
    }

    // Atualiza avatar se encontrar um
    if (!groups[groupKey].avatarUrl && loan.clientAvatarUrl) {
        groups[groupKey].avatarUrl = loan.clientAvatarUrl;
    }

    // Se o grupo foi criado com um nome antigo/diferente, mas este contrato tem nome mais atual/completo, podemos atualizar (opcional)
    // Aqui mantemos o primeiro nome encontrado para estabilidade visual

    groups[groupKey].loans.push(loan);
    if (isCapitalOnlyRecoveryLoan(loan)) groups[groupKey].hasCapitalOnlyRecovery = true;
    groups[groupKey].contractCount++;

    const loanDebt = loanEngine.computeRemainingBalance(loan).totalRemaining;
    groups[groupKey].totalDebt += loanDebt;
  });

  return Object.values(groups).map(group => {
    // Define se é standalone (apenas 1 contrato)
    group.isStandalone = group.loans.length === 1;

    let worstStatusPriority = 0; 
    let minDueDate = 9999999999999;
    let maxCreatedAt = 0;
    let maxUpdatedAt = 0;

    group.loans.forEach(loan => {
      const classification = resolveLoanVisualClassification(loan);
      const isPaid = classification === 'QUITADO';
      const hasCritical = !isPaid && classification === 'CRITICO';
      const hasLate = !isPaid && classification === 'ATRASADO';

      if (hasCritical) worstStatusPriority = Math.max(worstStatusPriority, 4);
      else if (hasLate) worstStatusPriority = Math.max(worstStatusPriority, 3);
      else if (!isPaid) worstStatusPriority = Math.max(worstStatusPriority, 1);
      else worstStatusPriority = Math.max(worstStatusPriority, 0);

      const nextDueDateStr = isPaid ? null : getLoanNextDueDate(loan);
      if (nextDueDateStr && nextDueDateStr !== '9999-12-31') {
          const t = new Date(nextDueDateStr).getTime();
          if (t < minDueDate) minDueDate = t;
      }
      
      const createdT = new Date(loan.startDate).getTime();
      if (createdT > maxCreatedAt) maxCreatedAt = createdT;

      const lastLedger = loan.ledger && loan.ledger.length > 0 ? loan.ledger[loan.ledger.length - 1] : null;
      const updatedT = lastLedger ? new Date(lastLedger.date).getTime() : createdT;
      if (updatedT > maxUpdatedAt) maxUpdatedAt = updatedT;
    });

    if (worstStatusPriority === 4) group.status = 'CRITICAL';
    else if (worstStatusPriority === 3) group.status = 'LATE';
    else if (worstStatusPriority === 2) group.status = 'WARNING';
    else if (worstStatusPriority === 1) group.status = 'OK';
    else group.status = 'PAID';

    group.loans.sort((a, b) => {
        const nextA = getLoanNextDueDate(a);
        const nextB = getLoanNextDueDate(b);
        return new Date(nextA).getTime() - new Date(nextB).getTime();
    });

    group._sortMeta = { minDueDate, maxCreatedAt, maxUpdatedAt };

    return group;
  }).sort((a, b) => {
     if (sortOption === 'NAME_ASC') return a.clientName.localeCompare(b.clientName);
     if (sortOption === 'CREATED_DESC') return (b._sortMeta?.maxCreatedAt || 0) - (a._sortMeta?.maxCreatedAt || 0);
     if (sortOption === 'UPDATED_DESC') return (b._sortMeta?.maxUpdatedAt || 0) - (a._sortMeta?.maxUpdatedAt || 0);

     const priority = { 'CRITICAL': 4, 'LATE': 3, 'WARNING': 2, 'OK': 1, 'PAID': 0 };
     if (priority[b.status] !== priority[a.status]) return priority[b.status] - priority[a.status];
     return (a._sortMeta?.minDueDate || 0) - (b._sortMeta?.minDueDate || 0);
  });
};
