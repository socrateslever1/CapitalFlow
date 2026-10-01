import {
  executeFinancialOperation,
  previewFinancialOperation,
  reverseFinancialOperation,
} from '../../../services/payments/paymentEngineV4';
import type { FinancialToolGateway } from '../financial/tools';

export const paymentEngineToolGateway: FinancialToolGateway = {
  preview: previewFinancialOperation,
  execute: executeFinancialOperation,
  reverse: reverseFinancialOperation,
};
