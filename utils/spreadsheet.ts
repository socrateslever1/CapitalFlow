type SpreadsheetSheet = {
  name: string;
  rows: unknown[][];
};

const normalizeCellValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;

  const cell = value as {
    result?: unknown;
    text?: string;
    richText?: Array<{ text?: string }>;
  };

  if (cell.result !== undefined) return cell.result;
  if (typeof cell.text === 'string') return cell.text;
  if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text || '').join('');
  return String(value);
};

export const readSpreadsheet = async (file: File): Promise<SpreadsheetSheet[]> => {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  return workbook.worksheets.map((worksheet) => {
    const rows: unknown[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(normalizeCellValue));
    });
    return { name: worksheet.name, rows };
  });
};

export const firstSheetAsRecords = async (file: File): Promise<Record<string, unknown>[]> => {
  const [sheet] = await readSpreadsheet(file);
  if (!sheet?.rows.length) return [];

  const headers = sheet.rows[0].map((value) => String(value || '').trim());
  return sheet.rows.slice(1).map((row) =>
    headers.reduce<Record<string, unknown>>((record, header, index) => {
      if (header) record[header] = row[index] ?? '';
      return record;
    }, {})
  );
};
