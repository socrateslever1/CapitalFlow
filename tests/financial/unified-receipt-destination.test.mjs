import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261113193409_unify_receipt_destination_flow.sql',
  'utf8',
);

test('recebimento historico usa o mesmo preparador idempotente do recebimento atual', () => {
  assert.match(migration, /personal_wallet_set_receipt_destination\(/);
  assert.match(migration, /wallet_route_receipt_internal\(/);
  assert.doesNotMatch(migration, /insert into public\.wallet_receipt_destinations/i);
  assert.doesNotMatch(migration, /delete from public\.financial_operations/i);
});

test('a conciliacao preserva a composicao contabil e a auditoria', () => {
  assert.match(migration, /v_operation\.amount_received - v_operation\.principal_paid - v_profit/);
  assert.match(migration, /insert into public\.wallet_historical_receipt_reconciliations/i);
  assert.match(migration, /wallet_destination_account_id = v_route\.account_id/);
  assert.match(migration, /p_destination_source_id, ROUND\(v_operation\.amount_received, 2\)/);
});
