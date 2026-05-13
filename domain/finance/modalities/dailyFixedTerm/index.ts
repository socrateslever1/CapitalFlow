
import { ModalityStrategy } from "../types";
import { calculateDailyFixedTerm } from "./calculations";
import { renewDailyFixedTerm } from "./renewal";
import { calculateDailyFixedTermInstallments } from "../../../../features/loans/modalities/daily/daily.calculations";
import { parseDateOnlyUTC, todayDateOnlyUTC } from "../../../../utils/dateHelpers";

export const dailyFixedTermStrategy: ModalityStrategy = {
    key: 'DAILY_FIXED_TERM',
    
    calculate: calculateDailyFixedTerm,
    renew: renewDailyFixedTerm,
    
    generateInstallments: (params) => {
        return calculateDailyFixedTermInstallments(
            params.principal, 
            params.rate, 
            params.startDate, 
            params.fixedDuration || '15',
            (params.initialData as any)?.skipWeekends || false
        );
    },

    card: {
        dueDateLabel: (inst, loan) => {
            if (!loan) return "Fim do Prazo";
            
            // Lógica específica para mostrar dia X de Y
            try {
                const start = parseDateOnlyUTC(loan.startDate).getTime();
                const end = parseDateOnlyUTC(inst.dueDate).getTime();
                const now = todayDateOnlyUTC().getTime();
                
                const msPerDay = 1000 * 60 * 60 * 24;
                const totalDays = Math.round((end - start) / msPerDay);
                
                // Dia Atual = (Hoje - Inicio) + 1
                const currentDayIndex = Math.floor((now - start) / msPerDay) + 1;
                
                if (currentDayIndex > totalDays) return `Fim do Prazo (+${currentDayIndex - totalDays}d)`;
                if (currentDayIndex < 1) return `Inicia em ${Math.abs(currentDayIndex)}d`;
                
                return `Dia ${currentDayIndex} / ${totalDays}`;
            } catch (e) {
                return "Vencimento";
            }
        },
        statusLabel: (inst, daysDiff) => {
            // daysDiff > 0: Atrasado (Prazo estourou)
            // daysDiff < 0: Futuro (Prazo correndo)
            
            if (daysDiff > 0) {
                return { 
                    text: `PRAZO ENCERRADO (+${daysDiff} DIAS)`, 
                    color: 'text-rose-500 font-black' 
                };
            }
            if (daysDiff < 0) {
                return { 
                    text: `PRAZO CORRENDO (RESTAM ${Math.abs(daysDiff)})`, 
                    color: 'text-blue-400 font-bold' 
                };
            }
            return { 
                text: 'ÚLTIMO DIA DO PRAZO', 
                color: 'text-amber-400 animate-pulse font-black' 
            };
        },
        showProgress: false 
    }
};
