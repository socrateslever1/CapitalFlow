import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchAllPages, idsMissingFromRemote, SYNC_PAGE_SIZE } from '../../services/offline/hybridSync';

test('fetchAllPages percorre todas as páginas sem perder registros', async () => {
  const calls: Array<[number, number]> = [];
  const rows = Array.from({ length: SYNC_PAGE_SIZE * 2 + 7 }, (_, id) => ({ id }));

  const result = await fetchAllPages(async (from, to) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });

  assert.equal(result.error, null);
  assert.equal(result.data.length, rows.length);
  assert.deepEqual(calls, [
    [0, SYNC_PAGE_SIZE - 1],
    [SYNC_PAGE_SIZE, SYNC_PAGE_SIZE * 2 - 1],
    [SYNC_PAGE_SIZE * 2, SYNC_PAGE_SIZE * 3 - 1],
  ]);
});

test('fetchAllPages interrompe sem descartar páginas anteriores quando o Supabase falha', async () => {
  const result = await fetchAllPages(async (from) => {
    if (from > 0) return { data: null, error: new Error('network') };
    return { data: Array.from({ length: SYNC_PAGE_SIZE }, (_, id) => ({ id })), error: null };
  });

  assert.equal(result.data.length, SYNC_PAGE_SIZE);
  assert.match(String(result.error?.message), /network/);
});

test('idsMissingFromRemote identifica registros removidos sem misturar proprietários', () => {
  const stale = idsMissingFromRemote(
    [{ id: 'a', owner_id: 'owner-1' }, { id: 'b', owner_id: 'owner-1' }, { id: 'foreign', owner_id: 'owner-2' }],
    [{ id: 'a' }],
    'owner-1',
  );

  assert.deepEqual(stale, ['b']);
});
