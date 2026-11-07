import type { Loan } from '../../types';

export const ARCHIVE_REASONS = [
  { code: 'NON_PAYMENT', label: 'Inadimplência confirmada', impact: 'BLOCK', description: 'O crédito ficará bloqueado até regularização.' },
  { code: 'BAD_DEBT', label: 'Prejuízo por dívida não paga', impact: 'BLOCK', description: 'Houve perda decorrente de falta de pagamento.' },
  { code: 'VOLUNTARY_WAIVER', label: 'Desistência voluntária da cobrança', impact: 'ALLOW', description: 'O encerramento não caracteriza inadimplência por si só.' },
  { code: 'BILATERAL_OFFSET', label: 'Compensação de obrigações', impact: 'ALLOW', description: 'Havia obrigações de ambas as partes.' },
  { code: 'ADMINISTRATIVE', label: 'Encerramento administrativo', impact: 'ALLOW', description: 'Encerramento por razões cadastrais ou operacionais.' },
  { code: 'DISPUTED', label: 'Dívida contestada', impact: 'REVIEW', description: 'Exige análise do histórico antes de conceder crédito.' },
  { code: 'OTHER', label: 'Outro motivo', impact: 'REVIEW', description: 'Exige análise do histórico antes de conceder crédito.' },
] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number]['code'];
export type CreditImpact = 'BLOCK' | 'ALLOW' | 'REVIEW';
export const isArchiveReason = (value: unknown): value is ArchiveReason =>
  typeof value === 'string' && ARCHIVE_REASONS.some(item => item.code === value);
export const creditImpactFromArchive = (value: ArchiveReason | null | undefined): CreditImpact =>
  ARCHIVE_REASONS.find(item => item.code === value)?.impact || 'REVIEW';
export const archiveReasonLabel = (value: ArchiveReason | null | undefined): string =>
  ARCHIVE_REASONS.find(item => item.code === value)?.label || 'Motivo não informado';
export function validateArchiveClassification(reason: unknown, note: unknown): string | null {
  if (!isArchiveReason(reason)) return 'Selecione um motivo de arquivamento.';
  const detail = String(note ?? '').trim();
  if (detail.length > 500) return 'A justificativa deve ter no máximo 500 caracteres.';
  if (reason !== 'ADMINISTRATIVE' && detail.length < 10) {
    return 'Descreva os fatos em pelo menos 10 caracteres para manter o histórico verificável.';
  }
  return null;
}
export function isSameBorrower(a: Pick<Loan,'clientId'|'debtorDocument'>, b: Pick<Loan,'clientId'|'debtorDocument'>): boolean {
  if (a.clientId && b.clientId && a.clientId === b.clientId) return true;
  const docA = String(a.debtorDocument || '').replace(/\D/g, '');
  const docB = String(b.debtorDocument || '').replace(/\D/g, '');
  return (docA.length === 11 || docA.length === 14) && docA === docB && !/^0+$/.test(docA);
}
