import { businessDateInManaus } from '../../../utils/businessDate';

/**
 * Regras de data dos acordos. O dia civil financeiro segue America/Manaus
 * (`utils/businessDate.ts`); nunca a data UTC de `toISOString()`, que vira o dia
 * seguinte entre 20h e 24h em Manaus.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Data do pagamento enviada às RPCs: define dias de atraso e a data do lançamento no ledger. */
export function agreementPaymentDate(at: Date = new Date()): string {
  return businessDateInManaus(at);
}

/** Primeiro vencimento padrão quando o acordo não informa: amanhã, no dia civil de Manaus. */
export function defaultAgreementFirstDueDate(at: Date = new Date()): string {
  return addDays(businessDateInManaus(at), 1);
}

/**
 * Normaliza uma data de vencimento para YYYY-MM-DD.
 * Texto já em formato de data é mantido literalmente (sem passar por fuso).
 * Objetos Date mantêm a conversão anterior (UTC). Entrada inválida vira o vencimento padrão.
 */
export function toAgreementDateOnly(value: unknown, at: Date = new Date()): string {
  if (typeof value === 'string') {
    const match = value.trim().match(DATE_ONLY);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const parsed = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(parsed.getTime())) return defaultAgreementFirstDueDate(at);
  return parsed.toISOString().slice(0, 10);
}

/** Parcela de acordo está vencida quando o vencimento é anterior ao dia civil de Manaus. */
export function isAgreementDueDateOverdue(dueDate: unknown, at: Date = new Date()): boolean {
  if (!dueDate) return false;
  return String(dueDate).slice(0, 10) < businessDateInManaus(at);
}
