
import { Loan } from '../types';
import { formatMoney } from './formatters';

export interface AuditDiff {
  [key: string]: {
    old: any;
    new: any;
    label: string;
  };
}

const FIELD_LABELS: Record<string, string> = {
  principal: 'Capital Principal',
  interestRate: 'Taxa de Juros',
  finePercent: 'Multa',
  dailyInterestPercent: 'Mora Diária',
  debtorName: 'Nome do Devedor',
  debtorPhone: 'WhatsApp',
  debtorDocument: 'CPF/CNPJ',
  sourceId: 'ID da Fonte',
  billingCycle: 'Modalidade',
  startDate: 'Data do Empréstimo'
};

export const getLoanDiff = (oldLoan: Loan, newLoan: Loan): AuditDiff => {
  const diff: AuditDiff = {};

  const fieldsToTrack = [
    'principal', 'interestRate', 'finePercent', 'dailyInterestPercent',
    'debtorName', 'debtorPhone', 'debtorDocument', 'sourceId', 'billingCycle', 'startDate'
  ];

  fieldsToTrack.forEach(field => {
    const oldVal = (oldLoan as any)[field];
    const newVal = (newLoan as any)[field];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[field] = {
        old: oldVal,
        new: newVal,
        label: FIELD_LABELS[field] || field
      };
    }
  });

  return diff;
};

export const humanizeAuditLog = (notesJson: string): string[] => {
  try {
    if (!notesJson.startsWith('{')) return [notesJson];
    
    const diff: AuditDiff = JSON.parse(notesJson);
    const sentences: string[] = [];

    Object.entries(diff).forEach(([key, data]) => {
      let oldDisplay = data.old;
      let newDisplay = data.new;

      // Formatação especial baseada na chave
      if (key === 'principal') {
        oldDisplay = formatMoney(Number(data.old));
        newDisplay = formatMoney(Number(data.new));
      } else if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('percent')) {
        oldDisplay = `${data.old}%`;
        newDisplay = `${data.new}%`;
      } else if (key === 'startDate') {
        oldDisplay = new Date(data.old).toLocaleDateString('pt-BR');
        newDisplay = new Date(data.new).toLocaleDateString('pt-BR');
      }

      sentences.push(`${data.label}: alterado de "${oldDisplay || 'vazio'}" para "${newDisplay || 'vazio'}"`);
    });

    return sentences.length > 0 ? sentences : ["Ajuste manual de dados (sem alterações de valores críticos)."];
  } catch (e) {
    return [notesJson];
  }
};
