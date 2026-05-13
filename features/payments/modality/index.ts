
import { Loan } from "../../../types";
import { modalityRegistry } from "../../../domain/finance/modalities/registry";
import { ModalityPaymentConfig } from "./types";
import { paymentFlowGiro } from "./giro/paymentFlow.giro";
import { paymentFlowDiarioA } from "./diarioA/paymentFlow.diarioA";
import { paymentFlowFixedTerm } from "./fixedTerm/paymentFlow.fixedTerm";

export const paymentModalityDispatcher = {
    getConfig(loan: Loan): ModalityPaymentConfig {
        const resolvedStrategy = modalityRegistry.get(loan.billingCycle);

        switch (resolvedStrategy.key) {
            case 'MONTHLY':
                return paymentFlowGiro;
            case 'DAILY_FREE':
                return paymentFlowDiarioA;
            case 'DAILY_FIXED_TERM':
                return paymentFlowFixedTerm;
            default:
                return paymentFlowGiro;
        }
    }
};
