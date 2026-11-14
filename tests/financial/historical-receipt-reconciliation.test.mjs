import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261112120000_historical_wallet_receipt_reconciliation.sql',
  'utf8',
);

test('reconciliação histórica usa operação original sem apagar o recebimento', () => {
  assert.match(migration, /create table if not exists public\.wallet_historical_receipt_reconciliations/);
  assert.match(migration, /operation_id uuid primary key references public\.financial_operations\(operation_id\)/);
  assert.match(migration, /operation_id uuid primary key/);
  assert.match(migration, /for update/);
  assert.match(migration, /status <> 'COMPLETED'/);
  assert.match(migration, /original_operation_id is null/);
  assert.match(migration, /wallet_route_receipt_internal/);
  assert.match(migration, /insert into public\.wallet_receipt_destinations/);
  assert.match(migration, /personal_wallet_reconcile_historical_receipt/);
  assert.doesNotMatch(migration, /delete from public\.financial_operations/);
  assert.doesNotMatch(migration, /update public\.financial_operations\s+set\s+(amount_received|principal_paid|interest_paid|late_fee_paid)/i);
});

test('reconciliação rejeita composição que não fecha em centavos', () => {
  assert.match(migration, /abs\(v_operation\.amount_received\s*-\s*v_operation\.principal_paid\s*-\s*v_profit\)\s*>\s*0\.02/);
});
