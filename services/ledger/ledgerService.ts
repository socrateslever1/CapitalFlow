// services/ledger/ledgerService.ts
import { Loan, UserProfile, CapitalSource, LedgerEntry } from '../../types';
import { executeLedgerAction } from './ledgerActions';
import { reverseTransaction } from './ledgerReverse';

export type LedgerActionType = 'DELETE' | 'ARCHIVE' | 'RESTORE' | 'DELETE_CLIENT' | 'DELETE_SOURCE' | 'ACTIVATE';

export const ledgerService = {
  executeLedgerAction(params: {
    type: LedgerActionType;
    targetId: string;
    loan?: Loan;
    activeUser: UserProfile;
    sources: CapitalSource[];
    refundChecked: boolean;
  }) {
    return executeLedgerAction(params);
  },

  reverseTransaction(transaction: LedgerEntry, activeUser: UserProfile, loan: Loan) {
    return reverseTransaction(transaction, activeUser, loan);
  },
};