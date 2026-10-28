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
