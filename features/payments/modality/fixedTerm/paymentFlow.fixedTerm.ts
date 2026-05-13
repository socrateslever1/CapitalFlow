import { ModalityPaymentConfig } from "../types";

export const paymentFlowFixedTerm: ModalityPaymentConfig = {
    allowPartial: true,  // Permitido abater aos poucos
    allowRenew: false,   // PROIBIDO mover data
    defaultAction: 'FULL' // Foco em quitar ou abater
};