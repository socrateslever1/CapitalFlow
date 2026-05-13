
import { ModalityStrategy } from "../types";
import { calculateDailyFixed } from "./dailyFixed.calculations";
import { renewDailyFixed } from "./dailyFixed.renewal";
import { calculateNewDailyInstallments } from "../../../../features/loans/modalities/daily/daily.calculations";

export const dailyFixedStrategy: ModalityStrategy = {
    key: 'DAILY_FIXED',
    
    calculate: calculateDailyFixed,
    renew: renewDailyFixed,
    
    generateInstallments: (params) => {
        return calculateNewDailyInstallments(
            'DAILY_FIXED',
            params.principal, 
            params.rate, 
            params.startDate, 
            params.fixedDuration || '30',
            params.initialData?.installments?.[0]?.id
        );
    },

    card: {
        dueDateLabel: () => "Vencimento (1º)",
        statusLabel: () => null,
        showProgress: false
    }
};
