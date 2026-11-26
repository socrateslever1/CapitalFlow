import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsvText, parseSpreadsheetDate, parseSpreadsheetMoney, parseStatementSpreadsheet, parseStatementTable,
} from '../../utils/statementSpreadsheet';
import { parseSmartFinancialDocument } from '../../utils/statementSmartReader';

// Dados fictícios: nenhum valor, nome ou identificador real.

test('valores em formato brasileiro, americano e com sinal', () => {
  assert.equal(parseSpreadsheetMoney('R$ 1.234,56'), 1234.56);
  assert.equal(parseSpreadsheetMoney('-1.234,56'), -1234.56);
  assert.equal(parseSpreadsheetMoney('(25,00)'), -25);
  assert.equal(parseSpreadsheetMoney('1234.56'), 1234.56);
  assert.equal(parseSpreadsheetMoney('1,234.56'), 1234.56);
  assert.equal(parseSpreadsheetMoney('1.000'), 1000);
  assert.equal(parseSpreadsheetMoney('25,90 D'), -25.9);
  assert.equal(parseSpreadsheetMoney(42.5), 42.5);
  assert.ok(Number.isNaN(parseSpreadsheetMoney('abc')));
});

test('datas dd/mm/aaaa, ISO, Date e número do Excel', () => {
  assert.equal(parseSpreadsheetDate('05/11/2026'), '2026-11-05');
  assert.equal(parseSpreadsheetDate('05/11/26'), '2026-11-05');
  assert.equal(parseSpreadsheetDate('2026-11-05'), '2026-11-05');
  assert.equal(parseSpreadsheetDate(new Date(Date.UTC(2026, 10, 5))), '2026-11-05');
  assert.equal(parseSpreadsheetDate(46331), '2026-11-05');
  assert.equal(parseSpreadsheetDate('31/02/2026'), null);
});

test('CSV com ponto e vírgula, aspas e cabeçalho depois de linhas de título', () => {
  const table = parseCsvText('Extrato teste\n\nData;Descrição;Valor\n01/11/2026;"Mercado; centro";-50,25\n02/11/2026;Salário teste;1.000,00\n');
  const result = parseStatementTable(table, 'ACCOUNT', 'hash');
  assert.deepEqual(result.rows.map(r => [r.date, r.description, r.amount]), [
    ['2026-11-01', 'Mercado; centro', -50.25],
    ['2026-11-02', 'Salário teste', 1000],
  ]);
});

test('fatura de cartão: compra positiva, pagamento e estorno negativos, parcela lida da coluna', () => {
  const csv = 'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\n'
    + '03/11/2026;TITULAR TESTE;0000;Mercado;Loja teste;Única;0;0;80,00\n'
    + '04/11/2026;TITULAR TESTE;0000;Eletro;Compra parcelada teste;2/5;0;0;120,00\n'
    + '05/11/2026;TITULAR TESTE;0000;;Inclusao de Pagamento;Única;0;0;-500,00\n'
    + '06/11/2026;TITULAR TESTE;0000;;Estorno loja teste;Única;0;0;-10,00\n';
  const result = parseStatementTable(parseCsvText(csv), 'CARD', 'hash');
  assert.deepEqual(result.rows.map(r => r.amount), [80, 120, -500, -10]);
  assert.deepEqual(result.rows.map(r => r.selected), [true, true, false, false]);
  assert.equal(result.rows[1].installmentNumber, 2);
  assert.equal(result.rows[1].installmentTotal, 5);
});

test('fatura que exporta compras negativas é invertida pela maioria', () => {
  const csv = 'date,title,amount\n2026-11-01,Loja A teste,-30.00\n2026-11-02,Loja B teste,-45.50\n2026-11-03,Pagamento recebido,200.00\n';
  const result = parseStatementTable(parseCsvText(csv), 'CARD', 'hash');
  assert.deepEqual(result.rows.map(r => r.amount), [30, 45.5, -200]);
});

test('extrato com colunas separadas de crédito e débito', () => {
  const csv = 'Data,Histórico,Crédito,Débito,Saldo\n01/11/2026,Pix recebido teste,150,00,\n';
  const table = parseCsvText('Data;Histórico;Crédito;Débito;Saldo\n01/11/2026;Pix recebido teste;150,00;;900,00\n02/11/2026;Conta de luz teste;;80,00;820,00\nSaldo final;;;;820,00\n');
  const result = parseStatementTable(table, 'ACCOUNT', 'hash');
  assert.deepEqual(result.rows.map(r => r.amount), [150, -80]);
});

test('planilha sem cabeçalho reconhecível dá mensagem clara', () => {
  assert.throws(() => parseStatementTable([['a', 'b'], ['1', '2']], 'ACCOUNT', 'h'), /colunas de data, descrição e valor/);
});

test('arquivo .csv e .xlsx passam pelo leitor central; .xls antigo pede conversão', async () => {
  const csv = new File(['Data;Descrição;Valor\n01/11/2026;Padaria teste;-12,50\n'], 'extrato.csv', { type: 'text/csv' });
  const parsed = await parseSmartFinancialDocument(csv, 'ACCOUNT');
  assert.equal(parsed.sourceType, 'SPREADSHEET');
  assert.equal(parsed.rows[0].amount, -12.5);

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Fatura');
  sheet.addRow(['Data', 'Descrição', 'Valor']);
  sheet.addRow([new Date(Date.UTC(2026, 10, 7)), 'Farmácia teste', 33.9]);
  const buffer = await workbook.xlsx.writeBuffer();
  const xlsx = new File([buffer], 'fatura.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fromXlsx = await parseStatementSpreadsheet(xlsx, 'CARD');
  assert.deepEqual(fromXlsx.rows.map(r => [r.date, r.description, r.amount]), [['2026-11-07', 'Farmácia teste', 33.9]]);

  await assert.rejects(parseStatementSpreadsheet(new File(['x'], 'antigo.xls'), 'CARD'), /\.xls antigo/);
});
