
import { ModalityStrategy } from "../types";
import { calculateLegacy } from "./legacy.calculations";
import { renewMonthly } from "../monthly/monthly.renewal"; // Legacy fallback renewal
import { calculateLegacyDailyInstallments } from "../../../../features/loans/modalities/daily/daily.calculations";

export const legacyStrategy: ModalityStrategy = {
    key: 'DAILY',
    
    calculate: calculateLegacy,
    renew: renewMonthly, // Legacy behaves like monthly for single renewal logic if enforced
    
    generateInstallments: (params) => {
        return calculateLegacyDailyInstallments(
            params.principal,
            params.rate,
            params.startDate,
            params.initialData,
            (params.initialData as any)?.skipWeekends || false
        );
    },

    card: {
        dueDateLabel: () => "Vencimento",
        statusLabel: () => null,
        showProgress: true
    }
};
