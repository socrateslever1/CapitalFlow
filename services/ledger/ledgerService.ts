// services/ledger/ledgerService.ts
import { Loan, UserProfile, CapitalSource, LedgerEntry } from '../../types';
import { executeLedgerAction } from './ledgerActions';
import { reverseTransaction } from './ledgerReverse';
import type { ArchiveReason } from '../../domain/credit/archivePolicy';

export type LedgerActionType = 'DELETE' | 'ARCHIVE' | 'RECLASSIFY_ARCHIVE' | 'RESTORE' | 'DELETE_CLIENT' | 'DELETE_SOURCE' | 'ACTIVATE';

export const ledgerService = {
  executeLedgerAction(params: {
    type: LedgerActionType;
    targetId: string;
    loan?: Loan;
    activeUser: UserProfile;
    sources: CapitalSource[];
    refundChecked: boolean;
    archiveReason?: ArchiveReason | '';
    archiveNote?: string;
  }) {
    return executeLedgerAction(params);
  },

  reverseTransaction(transaction: LedgerEntry, activeUser: UserProfile, loan: Loan) {
    return reverseTransaction(transaction, activeUser, loan);
  },
};