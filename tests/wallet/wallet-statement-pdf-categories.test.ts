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
