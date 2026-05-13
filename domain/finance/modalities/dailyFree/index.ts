
import { ModalityStrategy } from "../types";
import { calculateDailyFree } from "./dailyFree.calculations";
import { renewDailyFree } from "./dailyFree.renewal";
import { calculateNewDailyInstallments } from "../../../../features/loans/modalities/daily/daily.calculations";

export const dailyFreeStrategy: ModalityStrategy = {
    key: 'DAILY_FREE',
    
    calculate: calculateDailyFree,
    renew: renewDailyFree,
    
    generateInstallments: (params) => {
        return calculateNewDailyInstallments(
            'DAILY_FREE',
            params.principal, 
            params.rate, 
            params.startDate, 
            '0', // Duration ignored for Free
            params.initialData?.installments?.[0]?.id,
            (params.initialData as any)?.skipWeekends || false
        );
    },

    card: {
        dueDateLabel: () => "Pago até",
        statusLabel: (inst, daysDiff) => {
            // daysDiff > 0: Hoje é maior que data (Atrasado)
            // daysDiff < 0: Hoje é menor que data (Adiantado/Futuro)
            
            if (daysDiff > 0) {
                return { 
                    text: `ATRASADO HÁ ${daysDiff} DIAS`, 
                    color: 'text-rose-500 font-black' 
                };
            }
            if (daysDiff < 0) {
                return { 
                    text: `ADIANTADO (${Math.abs(daysDiff)} DIAS)`, 
                    color: 'text-emerald-400 font-black' 
                };
            }
            return { 
                text: 'VENCE HOJE', 
                color: 'text-amber-400 animate-pulse' 
            };
        },
        showProgress: false
    }
};
