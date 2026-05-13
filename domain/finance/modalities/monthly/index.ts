
import { ModalityStrategy } from "../types";
import { calculateMonthly } from "./monthly.calculations";
import { renewMonthly } from "./monthly.renewal";
import { calculateMonthlyInstallments } from "../../../../features/loans/modalities/monthly/monthly.calculations";

export const monthlyStrategy: ModalityStrategy = {
    key: 'MONTHLY',
    
    calculate: calculateMonthly,
    renew: renewMonthly,
    
    generateInstallments: (params) => {
        return calculateMonthlyInstallments(
            params.principal, 
            params.rate, 
            params.startDate, 
            params.initialData?.installments?.[0]?.id
        );
    },

    card: {
        dueDateLabel: () => "Vencimento",
        statusLabel: (inst, daysDiff) => {
            // daysDiff > 0: Hoje é maior que vencimento (Atrasado)
            // daysDiff < 0: Hoje é menor que vencimento (Futuro)
            
            if (daysDiff > 0) {
                return { 
                    text: `ATRASADO HÁ ${daysDiff} DIAS`, 
                    color: 'text-rose-500 font-black' 
                };
            }
            if (daysDiff < 0) {
                return { 
                    text: `FALTAM ${Math.abs(daysDiff)} DIAS`, 
                    color: 'text-blue-400' 
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
