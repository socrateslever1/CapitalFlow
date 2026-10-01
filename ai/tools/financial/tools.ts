import { z } from 'zod';
import type { FinancialOperationInput, FinancialOperationResult } from '../../../services/payments/paymentEngineV4';
import type { CapitalFlowTool } from '../core/types';
import { toolFailure, toolSuccess } from '../core/errors';

export interface FinancialToolGateway {
  preview(input: FinancialOperationInput): Promise<FinancialOperationResult>;
  execute(input: FinancialOperationInput): Promise<FinancialOperationResult>;
  reverse(originalIdempotencyKey: string, reason: string): Promise<unknown>;
}

const operationSchema = z.object({
  loanId: z.string().uuid(),
  installmentId: z.string().uuid(),
  operationType: z.enum(['KEEP_PENDING', 'RENEW_KEEP_PENDING', 'CAPITALIZE', 'SETTLE']),
  amountReceived: z.number().positive(),
  paymentMethod: z.enum(['PIX', 'CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'BOLETO', 'OTHER']),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  competenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  forgivenessMode: z.string().max(40).optional(),
  requestedLateFeeForgiven: z.number().min(0).optional(),
  manualDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  caixaLivreId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  expectedPreview: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

const reversalSchema = z.object({
  originalIdempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
}).strict();

const lendMoreSchema = z.object({
  loanId: z.string().uuid(),
  installmentId: z.string().uuid(),
  sourceId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().trim().max(500).optional(),
}).strict();

const stagingBlocker = 'STAGING_NOT_VERIFIED: Tool financeira permanece desabilitada.';

function disabledFinancialTool<TInput>(
  id: string,
  description: string,
  inputSchema: z.ZodType<TInput>,
  permission: 'FINANCIAL_WRITE' | 'FINANCIAL_REVERSAL',
  execute: CapitalFlowTool<TInput, unknown>['execute'],
): CapitalFlowTool<TInput, unknown> {
  return {
    id,
    description,
    risk: 'FINANCIAL_WRITE',
    enabled: false,
    inputSchema,
    permissions: [permission],
    requiresAuthentication: true,
    requiresConfirmation: true,
    blockers: [stagingBlocker],
    execute,
  };
}

export function createFinancialToolScaffolds(gateway?: FinancialToolGateway): CapitalFlowTool<any, any>[] {
  const unavailable = async () => toolFailure('TOOL_DISABLED', stagingBlocker);
  const preview = disabledFinancialTool(
    'payment.preview',
    'Solicita prévia ao mesmo Payment Engine V4 usado pela execução; nunca calcula valores localmente.',
    operationSchema,
    'FINANCIAL_WRITE',
    gateway
      ? async (input) => toolSuccess(await gateway.preview(input as FinancialOperationInput), { authoritativeBackend: 'preview_financial_operation_v4' })
      : unavailable,
  );
  const execute = disabledFinancialTool(
    'payment.execute',
    'Executa operação confirmada no Payment Engine V4.',
    operationSchema,
    'FINANCIAL_WRITE',
    gateway
      ? async (input) => toolSuccess(await gateway.execute(input as FinancialOperationInput), { authoritativeBackend: 'process_financial_operation_v4' })
      : unavailable,
  );
  const reverse = disabledFinancialTool(
    'payment.reverse',
    'Estorna uma operação V4 confirmada pelo backend.',
    reversalSchema,
    'FINANCIAL_REVERSAL',
    gateway
      ? async (input) => toolSuccess(await gateway.reverse(input.originalIdempotencyKey, input.reason), { authoritativeBackend: 'reverse_financial_operation_v4' })
      : unavailable,
  );

  return [
    preview,
    execute,
    reverse,
    disabledFinancialTool('payment.capitalize', 'Capitaliza saldo pelo Payment Engine V4.', operationSchema, 'FINANCIAL_WRITE', unavailable),
    disabledFinancialTool('payment.renew', 'Renova saldo pendente pelo Payment Engine V4.', operationSchema, 'FINANCIAL_WRITE', unavailable),
    disabledFinancialTool('payment.settle', 'Quita obrigação pelo Payment Engine V4.', operationSchema, 'FINANCIAL_WRITE', unavailable),
    disabledFinancialTool('loan.lend_more', 'Registra novo aporte por RPC atômica e idempotente.', lendMoreSchema, 'FINANCIAL_WRITE', unavailable),
  ];
}
