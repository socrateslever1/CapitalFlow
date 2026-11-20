import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateStatementTotals, classifyStatementDescription, groupBradescoStatementRows, matchesStatementRowSearch, parseStatementLines } from '../../utils/walletStatementPdf';

test('statement comparison sums all parsed rows in cents and reports invoice difference', () => {
  const result = calculateStatementTotals([
    { amount: 20.10, selected: true },
    { amount: 0.20, selected: false },
    { amount: -5.30, selected: false },
  ], 15.01);

  assert.deepEqual(result, {
    extractedTotalCents: 1500,
    invoiceTotalCents: 1501,
    invalidAmountCount: 0,
    differenceCents: 1,
  });
  assert.deepEqual(calculateStatementTotals([{ amount: 1.23 }]), {
    extractedTotalCents: 123,
    invoiceTotalCents: null,
    invalidAmountCount: 0,
    differenceCents: null,
  });
  assert.deepEqual(calculateStatementTotals([{ amount: Number.NaN }], 10), {
    extractedTotalCents: 0,
    invoiceTotalCents: 1000,
    invalidAmountCount: 1,
    differenceCents: null,
  });
});

test('PDF parser classifies common card statement categories and lowers confidence for unknown merchants', () => {
  const result = parseStatementLines([
    { key: '1', text: '01/10/2026 Spotify Premium 21,90' },
    { key: '2', text: '02/10/2026 Drogaria Central 45,00' },
    { key: '3', text: '03/10/2026 Mercado Livre 120,00' },
    { key: '4', text: '04/10/2026 Lançamento não identificado 15,00' },
  ], 'CARD');

  assert.deepEqual(result.rows.map(row => row.category), ['Lazer', 'Saúde', 'Compras', 'Outros']);
  assert.deepEqual(result.rows.map(row => row.confidence), ['HIGH', 'HIGH', 'HIGH', 'REVIEW']);
});

test('classifies Brazilian transport and food merchants consistently for PDF and other readers', () => {
  const examples: Array<[string, string]> = [
    ['UBER TRIP', 'Transporte'],
    ['99 RIDE', 'Transporte'],
    ['UBER *EATS', `Alimenta${String.fromCharCode(231)}${String.fromCharCode(227)}o`],
    ['99*FOOD', `Alimenta${String.fromCharCode(231)}${String.fromCharCode(227)}o`],
    ['POSTO IPIRANGA GASOLINA', 'Transporte'],
    ['EUCATUR PASSAGEM', 'Transporte'],
    ['EXPRESSO TRANSAMAZONICA', 'Transporte'],
    ['MERCADO PAGO *LOJA', 'Outros'],
    ['POSTO DE SAUDE MUNICIPAL', `Sa${String.fromCharCode(250)}de`],
    ['IFOOD', 'Alimenta\u00e7\u00e3o'],
    ['99FOOD', 'Alimenta\u00e7\u00e3o'],
    ['LANCHE DO RONNY', 'Alimenta\u00e7\u00e3o'],
    ['CHURRASCARIA BOI GORDO', 'Alimenta\u00e7\u00e3o'],
    ['RESTAURANTE CENTRAL', 'Alimenta\u00e7\u00e3o'],
  ];

  for (const [description, expected] of examples) {
    assert.equal(classifyStatementDescription(description), expected, `local reader: ${description}`);
  }

  const parsed = parseStatementLines(examples.map(([description], index) => ({
    key: String(index), text: `${String(index + 1).padStart(2, '0')}/10/2026 ${description} 12,00`,
  })), 'CARD');
  assert.deepEqual(parsed.rows.map(row => row.category), examples.map(([, category]) => category));
});

test('PDF parser extracts installment metadata without confusing the transaction date', () => {
  const result = parseStatementLines([
    { key: '1', text: '01/10/2026 Loja de roupas parcela 3/10 89,90' },
    { key: '2', text: '02/10/2026 Eletronicos 2 de 12 120,00' },
    { key: '3', text: '03/10/2026 Compra unica 03/10 40,00' },
  ], 'CARD');

  assert.deepEqual(result.rows.map(row => [row.installmentNumber, row.installmentTotal]), [[3, 10], [2, 12], [null, null]]);
});

test('PDF parser reads only the history section when the document has summaries', () => {
  const result = parseStatementLines([
    { key: '1', text: 'Resumo da fatura 4.000,00' },
    { key: '2', text: 'Limite disponível 6.000,00' },
    { key: '3', text: 'Histórico de lançamentos' },
    { key: '4', text: '05/10/2026 Mercado Central 120,00' },
    { key: '5', text: 'Total da fatura 120,00' },
    { key: '6', text: 'Vencimento 10/10/2026' },
  ], 'CARD');

  assert.deepEqual(result.rows.map(row => row.description), ['Mercado Central']);
});

test('PDF parser accepts merchant before the date, dotted dates, and multiline amounts', () => {
  const result = parseStatementLines([
    { key: 'header', text: 'Resumo do cartão 5.500,00' },
    { key: 'a', text: 'SUPERMERCADO CENTRAL 15.10.2026 1.234,56' },
    { key: 'b', text: '16/10/2026 UBER TRIP' },
    { key: 'c', text: 'corrida madrugada' },
    { key: 'd', text: 'R$ 39,90' },
    { key: 'e', text: '17/10/2026 PAGAMENTO DA FATURA 499,00 C' },
    { key: 'footer', text: 'Total da fatura R$ 775,46' },
  ], 'CARD');
  assert.deepEqual(result.rows.map(row => row.date), ['2026-10-15','2026-10-16','2026-10-17']);
  assert.deepEqual(result.rows.map(row => row.amount), [1234.56,39.9,-499]);
  assert.match(result.rows[0].description, /SUPERMERCADO CENTRAL/);
  assert.match(result.rows[1].description, /corrida madrugada/);
  assert(result.rows.every(row => row.selected === false));
});


test('Nubank-style payment without C suffix is a credit, never a purchase', () => {
  const result = parseStatementLines([
    {key:'header',text:'TRANSAÇÕES DE 29 SET A 30 OUT'},
    {key:'purchase',text:'03 OUT Recargapay *Loja R$ 2.807,73'},
    {key:'payment',text:'30 SET Pagamento em 30 SET -R$ 2.698,59'},
    {key:'creditPix',text:'06 OUT Pix no Crédito - Pagamento de boleto R$ 58,50'},
  ], 'CARD');
  assert.equal(result.rows[0].amount, 2807.73);
  assert.equal(result.rows[1].amount, -2698.59);
  assert.equal(result.rows[2].amount, 58.50);
  assert(result.rows.every(row => !row.selected));
});

test('Mercado Pago details of consumption delimit statements, not payment simulations', () => {
  const result = parseStatementLines([
    {key:'summary',text:'Total a pagar R$ 450,00'},
    {key:'marker',text:'Detalhes de consumo'},
    {key:'purchase',text:'14/03 Mercado Livre Parcela 8 de 21 R$ 85,61'},
    {key:'footer',text:'Total R$ 450,00'},
    {key:'simulated',text:'1 + 15x R$ 46,46'},
  ], 'CARD');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].amount, 85.61);
  assert.equal(result.rows[0].installmentNumber, 8);
  assert.equal(result.rows[0].installmentTotal, 21);
});


test('RecargaPay: negative purchases and subsequent same-day rows are positive card charges', () => {
  const result = parseStatementLines([
    {key:'header', text:'Compras no App'},
    {key:'p1', text:'23/10/2026 RecargaPay Assinatura - R$ 4,10'},
    {key:'p2', text:'RecargaPay Assinatura - R$ 4,10'},
    {key:'p3', text:'11/10/2026 RecargaPay Loja - R$ 8,20'},
    {key:'other', text:'Outros lançamentos'},
    {key:'pay', text:'30/09/2026 Pagamento Da Fatura + R$ 470,00'},
    {key:'footer', text:'Total da fatura R$ 450,00'},
  ], 'CARD');
  assert.deepEqual(result.rows.map(x=>x.amount),[4.1,4.1,8.2,-470]);
  assert.deepEqual(result.rows.slice(0,3).map(x=>x.date),['2026-10-23','2026-10-23','2026-10-11']);
  assert(result.rows.every(x=>!x.selected));
});
test('C6: inclusion of payment is a credit; interest and IOF are charges', () => {
  const result = parseStatementLines([
    {key:'mark',text:'Transações do cartão principal'},
    {key:'a',text:'20 mar Loja Exemplo - Parcela 8/12 80,06'},
    {key:'b',text:'02 out Inclusao de Pagamento 704,91'},
    {key:'c',text:'29 out Encargos 250,46'},
    {key:'d',text:'29 out IOF Rotativo 18,27'},
  ], 'CARD');
  assert.deepEqual(result.rows.map(row=>row.amount),[80.06,-704.91,250.46,18.27]);
  assert.deepEqual(result.rows[0] && [result.rows[0].installmentNumber,result.rows[0].installmentTotal],[8,12]);
});

test('Bradesco history separates installment metadata and removes currency conversion columns', () => {
  const result = parseStatementLines([
    { key: 'header', text: 'Data: 19/11/2026 - 17:58' },
    { key: 'purchase', text: '18/11 KI ANJO BRL 16,00 0,00 R$ 0,00 16,00' },
    { key: 'wrapped-installment', text: 'PARCELAD 6/12 0,54' },
    { key: 'old-installment', text: '31/12 PG *SHOPFACIL SA 11/18 BRL 242,72 0,00 R$ 0,00 242,72' },
    { key: 'older-installment', text: '26/10 MERCADOLIVRE*3PRODUTOS 13/13 BRL 66,61 0,00 R$ 0,00 66,61' },
  ], 'CARD');

  assert.deepEqual(result.rows.map(row => ({ date: row.date, description: row.description, amount: row.amount,
    installmentNumber: row.installmentNumber, installmentTotal: row.installmentTotal })), [
    { date: '2026-11-18', description: 'KI ANJO', amount: 16, installmentNumber: null, installmentTotal: null },
    { date: '2025-12-31', description: 'PG *SHOPFACIL SA', amount: 242.72, installmentNumber: 11, installmentTotal: 18 },
    { date: '2025-10-26', description: 'MERCADOLIVRE*3PRODUTOS', amount: 66.61, installmentNumber: 13, installmentTotal: 13 },
  ]);
  assert(matchesStatementRowSearch(result.rows[1], 'shopfacil'));
  assert(matchesStatementRowSearch(result.rows[1], '11/18'));
  assert(matchesStatementRowSearch(result.rows[1], '242,72'));
  assert(!matchesStatementRowSearch(result.rows[1], 'uber'));
});

test('Bradesco early PIX payment is subtracted from the statement total', () => {
  const result = parseStatementLines([
    { key: 'header', text: 'Data: 19/11/2026' },
    { key: 'history', text: 'Histórico de lançamentos' },
    { key: 'payment', text: '30/10 PAGTO ANTECIPADO PIX BRL 2.517,55 0,00 R$ 0,00 2.517,55' },
    { key: 'purchase', text: '18/11 DROGARIA BOM PRECO BRL 72,49 0,00 R$ 0,00 72,49' },
  ], 'CARD');

  assert.deepEqual(result.rows.map(row => [row.description, row.amount]), [
    ['PAGTO ANTECIPADO PIX', -2517.55],
    ['DROGARIA BOM PRECO', 72.49],
  ]);
});

test('Bradesco table groups wrapped history cells with the matching date and amount row', () => {
  const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y, 0] });
  const grouped = groupBradescoStatementRows([
    item('23/05', 60, 566.5),
    item('RECARGAPAY *MANOELSOC 6', 110.5, 573),
    item('/9', 110.5, 559.5),
    item('BRL 65,41', 309, 566.5),
    item('0,00', 420, 566.5),
    item('R$ 0,00', 470, 566.5),
    item('65,41', 516, 566.5),
    item('29/03', 60, 526),
    item('HIPER DB PARAIBA 8/8', 110.5, 526),
    item('52,49', 516, 526),
  ], 5);
  const result = parseStatementLines(grouped, 'CARD');

  assert.deepEqual(result.rows.map(row => ({ date: row.date, description: row.description, amount: row.amount,
    installmentNumber: row.installmentNumber, installmentTotal: row.installmentTotal })), [
    { date: '2026-05-23', description: 'RECARGAPAY *MANOELSOC', amount: 65.41, installmentNumber: 6, installmentTotal: 9 },
    { date: '2026-03-29', description: 'HIPER DB PARAIBA', amount: 52.49, installmentNumber: 8, installmentTotal: 8 },
  ]);
});
