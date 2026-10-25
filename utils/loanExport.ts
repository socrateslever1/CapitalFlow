import { Loan, CapitalSource } from '../types';
import { resolveLoanVisualClassification, getLoanNextDueDate, hasActiveLoanAgreement } from './loanFilterResolver';
import { translateBillingCycle, translateFilter, translateLoanStatus } from './translationHelpers';
import { getInstallmentsPaidAmount } from './loanStatus';
import { loanEngine } from '../domain/loanEngine';
import { formatMoney } from './formatters';

export interface ExportLoanRow {
  clientName: string;
  document: string;
  phone: string;
  status: string;
  modality: string;
  sourceName: string;
  principal: number;
  interestRate: number;
  totalToReceive: number;
  totalPaid: number;
  totalRemaining: number;
  startDate: string;
  nextDueDate: string;
  overdueDays: number;
  hasAgreement: string;
  notes: string;
}

export function prepareLoanExportData(loans: Loan[], sources: CapitalSource[]): ExportLoanRow[] {
  const today = new Date().toISOString().slice(0, 10);

  return loans.map((loan) => {
    const visualStatus = resolveLoanVisualClassification(loan);
    const statusLabel = translateFilter(visualStatus) || translateLoanStatus(loan.status);
    const source = sources.find((s) => s.id === loan.sourceId);
    const sourceName = source ? source.name : 'Carteira Padrão';

    const rawNextDue = getLoanNextDueDate(loan);
    const hasValidDueDate = rawNextDue && rawNextDue !== '9999-12-31';

    let formattedNextDue = '-';
    let overdueDays = 0;

    if (hasValidDueDate) {
      try {
        const [year, month, day] = rawNextDue.split('-');
        if (year && month && day) {
          formattedNextDue = `${day}/${month}/${year}`;
        } else {
          formattedNextDue = rawNextDue;
        }

        if (rawNextDue < today) {
          const diffMs = new Date(today + 'T12:00:00Z').getTime() - new Date(rawNextDue + 'T12:00:00Z').getTime();
          overdueDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
      } catch {
        formattedNextDue = rawNextDue;
      }
    }

    let formattedStartDate = '-';
    if (loan.startDate) {
      try {
        const [year, month, day] = loan.startDate.split('T')[0].split('-');
        if (year && month && day) {
          formattedStartDate = `${day}/${month}/${year}`;
        } else {
          formattedStartDate = loan.startDate;
        }
      } catch {
        formattedStartDate = loan.startDate;
      }
    }

    const remainingBal = loanEngine.computeRemainingBalance(loan);
    const paidAmount = getInstallmentsPaidAmount(loan.installments);

    return {
      clientName: loan.debtorName || 'Sem nome',
      document: loan.debtorDocument || '-',
      phone: loan.debtorPhone || '-',
      status: statusLabel,
      modality: translateBillingCycle(loan.billingCycle),
      sourceName,
      principal: Number(loan.principal || 0),
      interestRate: Number(loan.interestRate || 0),
      totalToReceive: Number(loan.totalToReceive || 0),
      totalPaid: Number(paidAmount || 0),
      totalRemaining: Number(remainingBal.totalRemaining || 0),
      startDate: formattedStartDate,
      nextDueDate: formattedNextDue,
      overdueDays,
      hasAgreement: hasActiveLoanAgreement(loan) ? 'Sim' : 'Não',
      notes: (loan.notes || '').replace(/[\r\n]+/g, ' ').trim(),
    };
  });
}

const triggerFileDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const exportLoansToCSV = (
  loans: Loan[],
  sources: CapitalSource[],
  filterName: string = 'Todos'
): void => {
  if (loans.length === 0) {
    throw new Error('Nenhum contrato para exportar no filtro atual.');
  }

  const rows = prepareLoanExportData(loans, sources);

  const headers = [
    'Cliente',
    'CPF/CNPJ',
    'Telefone',
    'Status',
    'Modalidade',
    'Carteira',
    'Capital Emprestado (R$)',
    'Taxa de Juros (%)',
    'Total Previsto (R$)',
    'Total Pago (R$)',
    'Saldo Devedor (R$)',
    'Data de Início',
    'Próximo Vencimento',
    'Dias em Atraso',
    'Em Acordo',
    'Observações',
  ];

  const escapeCSV = (val: string | number): string => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows: string[] = [];

  // BOM para UTF-8 garantindo acentos perfeitos no Excel brasileiro
  const BOM = '\uFEFF';

  // Cabeçalho
  csvRows.push(headers.map(escapeCSV).join(';'));

  // Linhas de dados
  rows.forEach((r) => {
    const line = [
      escapeCSV(r.clientName),
      escapeCSV(r.document),
      escapeCSV(r.phone),
      escapeCSV(r.status),
      escapeCSV(r.modality),
      escapeCSV(r.sourceName),
      escapeCSV(r.principal.toFixed(2).replace('.', ',')),
      escapeCSV(r.interestRate.toFixed(2).replace('.', ',')),
      escapeCSV(r.totalToReceive.toFixed(2).replace('.', ',')),
      escapeCSV(r.totalPaid.toFixed(2).replace('.', ',')),
      escapeCSV(r.totalRemaining.toFixed(2).replace('.', ',')),
      escapeCSV(r.startDate),
      escapeCSV(r.nextDueDate),
      escapeCSV(r.overdueDays),
      escapeCSV(r.hasAgreement),
      escapeCSV(r.notes),
    ];
    csvRows.push(line.join(';'));
  });

  // Linha de totais
  const totalPrincipal = rows.reduce((acc, r) => acc + r.principal, 0);
  const totalToReceive = rows.reduce((acc, r) => acc + r.totalToReceive, 0);
  const totalPaid = rows.reduce((acc, r) => acc + r.totalPaid, 0);
  const totalRemaining = rows.reduce((acc, r) => acc + r.totalRemaining, 0);

  const totalLine = [
    escapeCSV('TOTAL GERAL'),
    escapeCSV(`(${rows.length} contratos)`),
    '',
    '',
    '',
    '',
    escapeCSV(totalPrincipal.toFixed(2).replace('.', ',')),
    '',
    escapeCSV(totalToReceive.toFixed(2).replace('.', ',')),
    escapeCSV(totalPaid.toFixed(2).replace('.', ',')),
    escapeCSV(totalRemaining.toFixed(2).replace('.', ',')),
    '',
    '',
    '',
    '',
    '',
  ];
  csvRows.push(totalLine.join(';'));

  const csvContent = BOM + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  const sanitizedFilter = filterName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  triggerFileDownload(blob, `capitalflow_contratos_${sanitizedFilter}_${dateStr}.csv`);
};

export const exportLoansToExcel = async (
  loans: Loan[],
  sources: CapitalSource[],
  filterName: string = 'Todos'
): Promise<void> => {
  if (loans.length === 0) {
    throw new Error('Nenhum contrato para exportar no filtro atual.');
  }

  const rows = prepareLoanExportData(loans, sources);
  const { default: ExcelJS } = await import('exceljs');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalFlow';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Contratos', {
    views: [{ state: 'frozen', ySplit: 4, activeCell: 'A5' }],
  });

  // Título e Metadados do Relatório
  worksheet.mergeCells('A1:P1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'CAPITALFLOW • RELATÓRIO DE CONTRATOS';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' }, // Slate 900
  };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells('A2:P2');
  const subtitleCell = worksheet.getCell('A2');
  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} às ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  subtitleCell.value = `Filtro: ${filterName.toUpperCase()} • Quantidade: ${rows.length} contrato(s) • Gerado em: ${dateFormatted}`;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
  subtitleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800
  };
  subtitleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  worksheet.getRow(2).height = 20;

  worksheet.getRow(3).height = 8; // Linha de respiro em branco

  // Definição das Colunas
  worksheet.columns = [
    { key: 'clientName', width: 28 },
    { key: 'document', width: 18 },
    { key: 'phone', width: 18 },
    { key: 'status', width: 16 },
    { key: 'modality', width: 20 },
    { key: 'sourceName', width: 20 },
    { key: 'principal', width: 20 },
    { key: 'interestRate', width: 16 },
    { key: 'totalToReceive', width: 20 },
    { key: 'totalPaid', width: 20 },
    { key: 'totalRemaining', width: 20 },
    { key: 'startDate', width: 16 },
    { key: 'nextDueDate', width: 18 },
    { key: 'overdueDays', width: 16 },
    { key: 'hasAgreement', width: 14 },
    { key: 'notes', width: 32 },
  ];

  // Cabeçalhos das Colunas na Linha 4
  const headerTitles = [
    'Cliente',
    'CPF / CNPJ',
    'Telefone',
    'Status',
    'Modalidade',
    'Carteira',
    'Capital Emprestado',
    'Taxa Juros',
    'Total a Receber',
    'Total Pago',
    'Saldo Devedor',
    'Data Início',
    'Próx. Vencimento',
    'Dias Atraso',
    'Acordo Ativo',
    'Observações',
  ];

  const headerRow = worksheet.getRow(4);
  headerTitles.forEach((title, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = title;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }, // Blue 600
    };
    cell.alignment = {
      horizontal: [6, 7, 8, 9, 10, 13].includes(idx) ? 'right' : [1, 2, 3, 11, 12, 14].includes(idx) ? 'center' : 'left',
      vertical: 'middle',
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF1D4ED8' } },
    };
  });
  headerRow.height = 24;

  // Inserção dos Dados
  rows.forEach((r, index) => {
    const rowNumber = index + 5;
    const row = worksheet.getRow(rowNumber);

    row.values = [
      r.clientName,
      r.document,
      r.phone,
      r.status,
      r.modality,
      r.sourceName,
      r.principal,
      r.interestRate / 100, // Formatado como % no Excel
      r.totalToReceive,
      r.totalPaid,
      r.totalRemaining,
      r.startDate,
      r.nextDueDate,
      r.overdueDays,
      r.hasAgreement,
      r.notes,
    ];

    const isEven = index % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    // Formatações individuais por coluna
    for (let c = 1; c <= 16; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 9.5 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgArgb },
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      // Alinhamento e formatação numérica
      if ([7, 9, 10, 11].includes(c)) {
        // Moeda
        cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"R$" 0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (c === 8) {
        // Percentual
        cell.numFmt = '0.00%';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if ([2, 3, 4, 12, 13, 14, 15].includes(c)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }

      // Destaque visual no Status
      if (c === 4) {
        if (r.status.toLowerCase().includes('atras')) {
          cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFE11D48' } };
        } else if (r.status.toLowerCase().includes('dia') || r.status.toLowerCase().includes('quit')) {
          cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF059669' } };
        }
      }
    }

    row.height = 20;
  });

  // Linha de Totais no Fim
  const lastDataRowNumber = rows.length + 4;
  const totalsRowNumber = lastDataRowNumber + 1;
  const totalsRow = worksheet.getRow(totalsRowNumber);

  totalsRow.getCell(1).value = 'TOTAL GERAL';
  totalsRow.getCell(2).value = `(${rows.length} contratos)`;

  // Fórmulas de Soma
  totalsRow.getCell(7).value = { formula: `SUM(G5:G${lastDataRowNumber})` };
  totalsRow.getCell(9).value = { formula: `SUM(I5:I${lastDataRowNumber})` };
  totalsRow.getCell(10).value = { formula: `SUM(J5:J${lastDataRowNumber})` };
  totalsRow.getCell(11).value = { formula: `SUM(K5:K${lastDataRowNumber})` };

  totalsRow.height = 24;

  for (let c = 1; c <= 16; c++) {
    const cell = totalsRow.getCell(c);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }, // Slate 200
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
    };

    if ([7, 9, 10, 11].includes(c)) {
      cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"R$" 0.00';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
  }

  // Gera o buffer e dispara o download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dateStr = new Date().toISOString().slice(0, 10);
  const sanitizedFilter = filterName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  triggerFileDownload(blob, `capitalflow_contratos_${sanitizedFilter}_${dateStr}.xlsx`);
};
