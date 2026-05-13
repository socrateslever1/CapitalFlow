
import { useState, useRef, useMemo } from 'react';
import { Loan, LedgerEntry, AppTab } from '../../../types';

export const useProfilePageLogic = (loans: Loan[]) => {
    const [activeSection, setActiveSection] = useState<'PERSONAL' | 'BRAND' | 'DEFAULTS' | 'MENU' | 'AUDIT' | 'DANGER'>('PERSONAL');
    const profileImportRef = useRef<HTMLInputElement>(null);
    const backupRestoreRef = useRef<HTMLInputElement>(null);

    const auditLogs = useMemo(() => {
        if (!loans) return [];
        const all = loans.flatMap(l => 
            (l.ledger || []).map(t => ({
                ...t,
                clientName: l.debtorName,
                loanId: l.id
            }))
        );
        return all.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);
    }, [loans]);

    return {
        activeSection,
        setActiveSection,
        profileImportRef,
        backupRestoreRef,
        auditLogs
    };
};
