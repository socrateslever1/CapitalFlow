import { Loan } from '../../../../types';
import { calculateFlowDre } from '../../../../domain/finance/dre.calculations';

export const buildExtratoAIContext = (
    period: string,
    dre: any,
    activeFilter: string,
    transactions: any[]
) => {
    return {
        period,
        dre: {
            grossRevenue: dre.grossRevenue,
            interestReceived: dre.interestReceived,
            lateFeeReceived: dre.lateFeeReceived,
            principalRecovered: dre.principalRecovered,
            investment: dre.investment,
            cashFlow: dre.cashFlow,
            netResult: dre.netResult
        },
        activeFilter,
        transactionCount: transactions.length,
        recentTransactions: transactions.slice(0, 20).map(t => ({
            date: t.date,
            amount: t.amount,
            type: t.type,
            client: t.clientName
        }))
    };
};
