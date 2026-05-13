
import { ModalityPaymentConfig } from "../types";

export const paymentFlowDiarioB: ModalityPaymentConfig = {
    allowPartial: false, // Ciclo fechado tende a exigir pagamento completo ou renovação total
    allowRenew: true,
    defaultAction: 'RENEW_INTEREST'
};
