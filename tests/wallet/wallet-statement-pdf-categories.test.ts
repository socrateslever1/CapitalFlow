import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStatementLines } from '../../utils/walletStatementPdf';

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
