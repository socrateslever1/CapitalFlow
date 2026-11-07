import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadAllWalletRows } from '../../features/wallet/services/walletCompleteRead';

test('leitura financeira percorre todas as páginas mesmo com teto menor que o pedido', async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ id: `row-${index}` }));
  const ranges: Array<[number, number]> = [];
  const result = await loadAllWalletRows(async (from, to) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + 2)), error: null };
  }, 3);
  assert.deepEqual(result.data, rows);
  assert.deepEqual(ranges.map(([from]) => from), [0, 2, 4, 5]);
});

test('erro em página posterior bloqueia resultado parcial', async () => {
  await assert.rejects(() => loadAllWalletRows(async from => from === 0
    ? { data: [{ id: 'first' }], error: null }
    : { data: null, error: { message: 'Falha de rede' } }, 2), /Falha de rede/);
});


test('históricos financeiro e de importação são paginados no snapshot completo', () => {
  const source = readFileSync('services/personalWallet.service.ts', 'utf8');
  const start = source.indexOf('  async load() {');
  assert.ok(start >= 0);
  const fullSnapshot = source.slice(start, start + 4500);
  for (const table of ['personal_wallet_account_operations', 'personal_wallet_statement_rows']) {
    assert.ok(fullSnapshot.includes("loadAllWalletRows((from, to) => supabase.from('" + table + "')"));
  }
  assert.ok(!fullSnapshot.includes('.limit(2000)'));
});
