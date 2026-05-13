
import { ModalityStrategy } from "../types";
import { calculateDaily30 } from "./daily30.calculations";
import { renewDaily30 } from "./daily30.renewal";
import { calculateNewDailyInstallments } from "../../../../features/loans/modalities/daily/daily.calculations";

export const daily30Strategy: ModalityStrategy = {
    key: 'DAILY_30_INTEREST', 
    
    calculate: calculateDaily30,
    renew: renewDaily30,
    
    generateInstallments: (params) => {
        return calculateNewDailyInstallments(
            'DAILY_30_INTEREST',
            params.principal, 
            params.rate, 
            params.startDate, 
            '30',
            params.initialData?.installments?.[0]?.id
        );
    },

    card: {
        dueDateLabel: () => "Vencimento",
        statusLabel: () => null,
        showProgress: false
    }
};

export const daily30CapitalStrategy: ModalityStrategy = {
    key: 'DAILY_30_CAPITAL', 
    
    calculate: calculateDaily30,
    renew: renewDaily30,
    
    generateInstallments: (params) => {
        return calculateNewDailyInstallments(
            'DAILY_30_CAPITAL',
            params.principal, 
            params.rate, 
            params.startDate, 
            '30',
            params.initialData?.installments?.[0]?.id
        );
    },

    card: {
        dueDateLabel: () => "Vencimento",
        statusLabel: () => null,
        showProgress: false
    }
};
