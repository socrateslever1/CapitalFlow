
import { LoanFormState } from '../domain/loanForm.mapper';
import { LoanBillingModality, PaymentMethod } from '@/types';

export const getInitialFormState = (defaultSourceId: string = ''): LoanFormState => {
    // FIX: Usar a data local correta ao invés de UTC para o input type="date"
    const now = new Date();
    // Subtrai o offset do fuso horário para garantir que toISOString() retorne o dia local
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const defaultDateStr = localDate.toISOString().split('T')[0];

    return {
        clientId: '',
        debtorName: '',
        debtorPhone: '',
        debtorDocument: '',
        debtorAddress: '',
        sourceId: defaultSourceId,
        preferredPaymentMethod: 'PIX' as PaymentMethod,
        pixKey: '',
        principal: '',
        interestRate: '30',
        finePercent: '2', 
        dailyInterestPercent: '1',
        billingCycle: 'MONTHLY' as LoanBillingModality,
        notes: '',
        guaranteeDescription: '',
        startDate: defaultDateStr
    };
};
