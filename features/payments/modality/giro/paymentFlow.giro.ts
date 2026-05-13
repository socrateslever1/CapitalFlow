
import { ModalityPaymentConfig } from "../types";

export const paymentFlowGiro: ModalityPaymentConfig = {
    allowPartial: true,
    allowRenew: true,
    defaultAction: 'RENEW_INTEREST'
};
