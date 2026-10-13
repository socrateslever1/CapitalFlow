import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'Data inválida.',
);

export const clientLookupSchema = z.object({
  kind: z.enum(['NAME', 'CODE', 'PHONE', 'DOCUMENT']),
  query: z.string().trim().min(2).max(200),
  includeDocument: z.boolean().optional().default(false),
}).strict();

export const contractSelectorSchema = z.object({
  contractId: uuid.optional(),
  clientId: uuid.optional(),
}).strict().refine(
  (value) => Number(Boolean(value.contractId)) + Number(Boolean(value.clientId)) === 1,
  'Informe exatamente um contractId ou clientId.',
);

export const debtSchema = contractSelectorSchema.safeExtend({
  referenceDate: isoDate.optional(),
});

export const dueDatesSchema = z.object({
  query: z.enum(['TODAY', 'TOMORROW', 'NEXT', 'OVERDUE', 'RANGE']),
  referenceDate: isoDate.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
}).strict().refine(
  (value) => value.query !== 'RANGE' || Boolean(value.from && value.to && value.from <= value.to),
  'Intervalo inválido.',
);

export const profitabilitySchema = z.object({
  scope: z.enum(['CLIENT', 'CONTRACT', 'RANKING']),
  clientId: uuid.optional(),
  contractId: uuid.optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
}).strict().superRefine((value, context) => {
  if (value.scope === 'CLIENT' && !value.clientId) context.addIssue({ code: 'custom', message: 'clientId é obrigatório.' });
  if (value.scope === 'CONTRACT' && !value.contractId) context.addIssue({ code: 'custom', message: 'contractId é obrigatório.' });
  if (value.scope === 'RANKING' && (value.clientId || value.contractId)) context.addIssue({ code: 'custom', message: 'Ranking não aceita identificador.' });
});

export type ClientLookupInput = z.infer<typeof clientLookupSchema>;
export type ContractSelectorInput = z.infer<typeof contractSelectorSchema>;
export type DebtInput = z.infer<typeof debtSchema>;
export type DueDatesInput = z.infer<typeof dueDatesSchema>;
export type ProfitabilityInput = z.infer<typeof profitabilitySchema>;
