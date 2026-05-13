
import { Loan, Installment } from "../../../types";

export type PaymentFlowResult = {
    amountToPay: number;
    description: string;
    nextAction?: 'CLOSE_MODAL' | 'SHOW_RECEIPT';
};

export interface ModalityPaymentConfig {
    allowPartial: boolean;
    allowRenew: boolean;
    defaultAction: 'RENEW_INTEREST' | 'FULL';
}
